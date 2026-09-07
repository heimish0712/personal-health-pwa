import { createContainer } from '../../js/bootstrap/container.js';
import { canonicalJson } from '../../js/core/backup/canonical-json.js';
import { payloadHash } from '../../js/core/backup/backup-integrity.js';
import { healthPeriod, healthPoints, healthLocalInput } from '../../js/core/health-rules.js';
import { renderCalendar } from '../../js/pages/exercise/pass-schedule.page.js';
import { renderHealthForm, renderHealthGraph } from '../../js/pages/weight/weight.page.js';
import { nowLocalInput } from '../../js/core/datetime.js';
import { clearNavigationGuard } from '../../js/router.js';

export async function runHealthTests(test) {
  const containers = []; let failure = null;
  const make = async (name) => { const c = createContainer({ dbName: `personal-health-pwa-test-health-${name}-${crypto.randomUUID()}`, clock: { nowIso: () => '2026-09-07T12:00:00.000Z' }, faultInjector(step) { if (step === failure) throw new Error('Injected health transaction failure'); } }); containers.push(c); await c.database.open(); await c.bootstrapService.initialize(); return c; };
  const rejects = async (work, code) => { try { await work(); return false; } catch (error) { return !code || error.code === code; } };
  const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
  const root = document.createElement('div'); document.body.append(root);
  const input = { measured_at_local: '2026-09-07T09:00', weight: 70, memo: '아침 <메모>' };
  try {
    const c = await make('main'), h = c.healthService;
    let w = await h.saveWeight(input);
    await test('HEALTH-01-CREATE', () => w.revision === 1 && w.source === 'manual' && !Object.hasOwn(w, 'source_ref_id') && w.measured_at === '2026-09-07T00:00:00.000Z', 'Manual creation preserves scoped metadata and UTC conversion.');
    w = await h.saveWeight({ ...input, weight: 69.8 }, w.id, w.revision);
    await test('HEALTH-02-UPDATE', () => w.revision === 2 && w.weight === 69.8 && w.memo === input.memo, 'Manual edit increments revision and preserves memo.');
    await test('HEALTH-03-STALE-WEIGHT', () => rejects(() => h.saveWeight(input, w.id, 1), 'REVISION_CONFLICT'), 'Stale manual revision blocked.');
    w = await h.deleteWeight(w.id, w.revision);
    await test('HEALTH-04-DELETE', async () => w.deleted_at !== null && (await h.summary()).latest === null, 'Soft delete removes weight from latest summary.');
    w = await h.restoreWeight(w.id, w.revision);
    await test('HEALTH-05-RESTORE', () => w.revision === 4 && w.deleted_at === null, 'Restore preserves UUID and increments revision.');
    const later = await h.saveWeight({ ...input, measured_at_local: '2026-09-07T21:00', weight: 69.4 });
    await h.saveWeight({ ...input, measured_at_local: '2026-09-06T08:00', weight: 72 });
    await test('HEALTH-06-SAME-DAY', async () => (await h.list('7')).weights.filter((r) => r.measured_at.startsWith('2026-09-07')).length === 2, 'Same-day measurements remain separate rows.');
    await test('HEALTH-07-LATEST-DELTA', async () => { const s = await h.summary(); return s.latest.id === later.id && s.previous.id === w.id && s.delta === -0.4; }, 'Latest and delta use measured_at rather than creation time.');
    await test('HEALTH-08-VALIDATION', async () => {
      for (const value of [0, -1, NaN, Infinity, '70', true, {}]) if (!await rejects(() => h.saveWeight({ ...input, weight: value }), 'HEALTH_INVALID')) return false;
      return await rejects(() => h.saveWeight({ ...input, measured_at_local: '2026-02-30T09:00' }), 'DATETIME_INVALID');
    }, 'Reject impossible dates and nonfinite/non-numeric/nonpositive weight.');
    let b = await h.saveInbody({ ...input, skeletal_muscle_mass: 29.5, body_fat_mass: 18, body_fat_percentage: 25, bmi: 23.5, visceral_fat_level: 8, basal_metabolic_rate: 1500, link_weight: true });
    let linked = await c.repositories.weight.findByInbody(b.id), linkedId = linked.id;
    await test('HEALTH-09-LINK-CREATE', () => linked.source === 'inbody' && linked.source_ref_id === b.id && linked.measured_at === b.measured_at && linked.weight === b.weight && linked.memo === b.memo, 'InBody and linked weight atomically created.');
    await test('HEALTH-10-LINK-GUARD', async () => await rejects(() => h.saveWeight(input, linked.id, linked.revision), 'HEALTH_INVALID') && await rejects(() => h.deleteWeight(linked.id, linked.revision), 'HEALTH_INVALID') && await rejects(() => h.restoreWeight(linked.id, linked.revision), 'HEALTH_INVALID'), 'Linked weight cannot be independently edited, deleted or restored.');
    b = await h.saveInbody({ ...b, measured_at: '2026-09-07T02:00:12.345Z', weight: 68.5, memo: '동기화' }, b.id, b.revision);
    linked = await c.repositories.weight.findByInbody(b.id);
    await test('HEALTH-11-LINK-SYNC', () => linked.id === linkedId && linked.revision === 2 && linked.weight === 68.5 && linked.measured_at === b.measured_at && linked.memo === '동기화', 'Time, value and memo synchronized without another row.');
    await test('HEALTH-12-STALE-INBODY', () => rejects(() => h.saveInbody({ ...b, weight: 80 }, b.id, 1), 'REVISION_CONFLICT'), 'Stale InBody write cannot mutate linked weight.');
    b = await h.saveInbody({ ...b, link_weight: false }, b.id, b.revision);
    await test('HEALTH-13-LINK-OFF', async () => (await c.repositories.weight.findByInbody(b.id)).deleted_at !== null, 'OFF soft-deletes linked row.');
    b = await h.saveInbody({ ...b, link_weight: true }, b.id, b.revision);
    await test('HEALTH-14-LINK-REUSE', async () => { const row = await c.repositories.weight.findByInbody(b.id); return row.id === linkedId && row.deleted_at === null && (await c.repositories.weight.list({ includeDeleted: true })).filter((r) => r.source_ref_id === b.id).length === 1; }, 'ON reuses the unique soft-deleted row.');
    b = await h.deleteInbody(b.id, b.revision);
    await test('HEALTH-15-DELETE-PAIR', async () => b.deleted_at !== null && (await c.repositories.weight.findByInbody(b.id)).deleted_at !== null, 'Delete affects both records.');
    b = await h.restoreInbody(b.id, b.revision);
    await test('HEALTH-16-RESTORE-PAIR', async () => { const row = await c.repositories.weight.findByInbody(b.id); return row.id === linkedId && row.deleted_at === null && row.weight === b.weight && row.measured_at === b.measured_at; }, 'Restore validates and restores the same linked row.');
    let noLink = await h.saveInbody({ ...input, weight: null, body_fat_percentage: 0, link_weight: false });
    await test('HEALTH-17-OPTIONAL', () => noLink.weight === null && noLink.body_fat_percentage === 0 && noLink.skeletal_muscle_mass === null, 'Missing metrics remain null; optional zero value remains zero.');
    await test('HEALTH-18-INBODY-VALIDATION', async () => await rejects(() => h.saveInbody({ ...input, weight: null, link_weight: true }), 'HEALTH_INVALID') && await rejects(() => h.saveInbody({ ...input, body_fat_percentage: 101, link_weight: false }), 'HEALTH_INVALID') && await rejects(() => h.saveInbody({ ...input, skeletal_muscle_mass: -1, link_weight: false }), 'HEALTH_INVALID'), 'Link requires weight; negative mass and percent above 100 rejected.');
    for (const step of ['inbody-after-record', 'inbody-after-weight']) {
      await test(`HEALTH-19-ROLLBACK-${step}`, async () => {
        const before = await c.backupSnapshotReader.readCurrentProfile(); failure = step;
        const rejected = await rejects(() => h.saveInbody({ ...input, link_weight: true })); failure = null;
        return rejected && equal(before, await c.backupSnapshotReader.readCurrentProfile());
      }, 'Injected create failure leaves no partial rows or metadata changes.');
      for (const operation of ['save', 'delete', 'restore']) await test(`HEALTH-20-${operation}-${step}`, async () => {
        let row = await h.saveInbody({ ...input, link_weight: true }); if (operation === 'restore') row = await h.deleteInbody(row.id, row.revision);
        const before = await c.backupSnapshotReader.readCurrentProfile(); failure = step;
        const rejected = await rejects(() => operation === 'save' ? h.saveInbody({ ...row, weight: 50, link_weight: false }, row.id, row.revision) : h[`${operation}Inbody`](row.id, row.revision)); failure = null;
        return rejected && equal(before, await c.backupSnapshotReader.readCurrentProfile());
      }, 'Existing pair changes roll back both stores including revision and tombstones.');
    }
    await test('HEALTH-21-GRAPH-SOURCE', async () => { const d = await h.list('all'); return (await h.graph('weight', 'all')).length === d.weights.length && healthPoints('weight', d.weights, d.inbodies).filter((p) => p.id === linkedId).length === 1; }, 'Weight graph reads only weight rows, never duplicates InBody weight.');
    await test('HEALTH-22-GRAPH-METRICS', async () => (await h.graph('skeletal_muscle_mass', 'all')).length === 1 && (await h.graph('body_fat_percentage', 'all')).some((p) => p.value === 0), 'InBody metrics skip missing values and include real zero values.');
    await test('HEALTH-23-RANGE-BOUNDARY', async () => { const d = await h.range('2026-09-07T00:00:00.000Z', '2026-09-07T02:00:12.345Z'); return d.weights.some((r) => r.id === w.id) && !d.weights.some((r) => r.id === linkedId || r.id === later.id); }, 'Profile/date index uses inclusive start and exclusive end.');
    await test('HEALTH-24-PERIODS', () => {
      const now = '2026-05-31T14:00:00.000Z', tz = 'Asia/Seoul';
      return healthPeriod('7', now, tz).start === '2026-05-24T15:00:00.000Z' && healthPeriod('30', now, tz).start === '2026-05-01T15:00:00.000Z' && healthPeriod('3m', now, tz).start === '2026-02-27T15:00:00.000Z' && healthPeriod('all', now, tz).start === '';
    }, 'Local 7/30-day boundaries and 3-calendar-month end-day clamp correct.');
    await test('HEALTH-25-NO-FULL-SCAN', async () => {
      const original = IDBObjectStore.prototype.getAll, originalList = c.repositories.weight.list; let used = false;
      IDBObjectStore.prototype.getAll = function () { used = true; throw new Error('Full-store scan forbidden'); };
      c.repositories.weight.list = () => { used = true; throw new Error('Generic list forbidden'); };
      try { await h.list('30'); await h.summary(); return !used; } finally { IDBObjectStore.prototype.getAll = original; c.repositories.weight.list = originalList; }
    }, 'Measurement periods and latest summary actually use existing IDB indexes.');
    const profile = c.identityContext.getCurrentProfileId(), other = await c.repositories.profile.create({ display_name: '격리', timezone: 'Asia/Seoul', seed_version: 1 });
    c.identityContext.setCurrentProfileId(other.id);
    await test('HEALTH-26-PROFILE', async () => (await h.list('all')).weights.length === 0 && (await h.summary()).inbody === null && await rejects(() => h.deleteInbody(b.id, b.revision), 'ENTITY_NOT_FOUND') && await rejects(() => h.saveWeight(input, w.id, w.revision), 'ENTITY_NOT_FOUND'), 'Foreign Profile reads and mutations are isolated.');
    c.identityContext.setCurrentProfileId(profile);
    const local = healthLocalInput(b.measured_at, await h.timezone());
    const same = await h.saveInbody({ ...b, measured_at_local: local }, b.id, b.revision); b = same;
    await test('HEALTH-27-PRECISION', () => same.measured_at === '2026-09-07T02:00:12.345Z', 'Editing preserves seconds and milliseconds, including imported values.');
    const exported = (await c.backupExportService.exportCurrentProfile()).document;
    const target = await make('restore'), preview = await target.backupImportService.inspectFile(new Blob([canonicalJson(exported)]));
    await target.backupImportService.restorePreview(preview.id);
    await test('HEALTH-28-BACKUP', async () => { const restored = await target.backupSnapshotReader.readCurrentProfile(); return equal(restored.data.weight_logs, exported.data.weight_logs) && equal(restored.data.inbody_logs, exported.data.inbody_logs); }, 'Pristine restore preserves UUID, revision, deleted state, all metrics, source/ref and link intent exactly.');
    const before = await target.backupSnapshotReader.readCurrentProfile(); target.database.close(); await target.database.open(); await target.bootstrapService.initialize();
    await test('HEALTH-29-REOPEN', async () => equal(before, await target.backupSnapshotReader.readCurrentProfile()), 'Database reopen/bootstrap leaves measurements unchanged.');
    await test('HEALTH-30-BACKUP-CONFLICT', async () => { const bad = structuredClone(exported); bad.data.weight_logs.find((r) => r.id === linkedId).weight += 1; bad.integrity.payloadHash = await payloadHash(bad); return rejects(() => target.backupImportService.inspectFile(new Blob([canonicalJson(bad)])), 'BACKUP_REFERENCE_BROKEN'); }, 'Valid-checksum backup with inconsistent active pair rejected.');
    noLink = await h.deleteInbody(noLink.id, noLink.revision); noLink = await h.restoreInbody(noLink.id, noLink.revision);
    await test('HEALTH-31-NO-LINK-RESTORE', async () => noLink.link_weight === false && !await c.repositories.weight.findByInbody(noLink.id), 'Restoring unlinked InBody does not create weight.');
    let off = await h.saveInbody({ ...input, link_weight: true }); off = await h.saveInbody({ ...off, link_weight: false }, off.id, off.revision); off = await h.deleteInbody(off.id, off.revision); off = await h.restoreInbody(off.id, off.revision);
    await test('HEALTH-32-OFF-INTENT', async () => !off.link_weight && (await c.repositories.weight.findByInbody(off.id)).deleted_at !== null, 'OFF intent survives InBody delete and restore without reviving weight.');
    await test('HEALTH-33-CONCURRENT', async () => { const results = await Promise.allSettled([h.saveInbody({ ...b, weight: 61 }, b.id, b.revision), h.saveInbody({ ...b, weight: 62 }, b.id, b.revision)]); const row = await h.get('inbody', b.id), link = await c.repositories.weight.findByInbody(b.id); return results.filter((r) => r.status === 'fulfilled').length === 1 && link.weight === row.weight; }, 'Concurrent edits serialize; one stale revision rejected and pair consistent.');
    const legacy = await c.repositories.inbody.create({ measured_at: '2026-09-07T05:00:00.000Z', weight: 60 });
    await c.repositories.weight.create({ measured_at: legacy.measured_at, weight: 60, source: 'inbody', source_ref_id: legacy.id });
    await test('HEALTH-34-LEGACY', async () => { const row = await h.get('inbody', legacy.id); return row.link_weight === true && (await h.saveInbody(row, row.id, row.revision)).link_weight === true; }, 'Legacy backups with no link flag infer existing relation safely.');
    const calendar = await make('calendar'), day = nowLocalInput('Asia/Seoul').slice(0, 10), health = calendar.healthService;
    const cb = await health.saveInbody({ ...input, measured_at_local: `${day}T08:00`, link_weight: true });
    const cw = await health.saveWeight({ ...input, measured_at_local: `${day}T10:00` });
    const context = { root, services: { calendar: calendar.calendarService, diet: calendar.dietService, health, activity: calendar.passScheduleService, exerciseQuery: calendar.exerciseQueryService }, setTitle() {}, showToast() {}, showError(m, error) { throw error; }, navigate() {}, isCurrent: () => true };
    await renderCalendar(context);
    await test('HEALTH-35-CALENDAR', () => root.querySelectorAll('[data-calendar-entry]').length === 2 && root.textContent.includes('인바디 · 체중 연동') && root.querySelector(`[data-health-route="/weight/log/${cw.id}"]`), 'Calendar displays manual weight and one combined InBody/weight entry with real routes.');
    await renderHealthForm(context, 'inbody', cb.id);
    await test('HEALTH-36-FORM', () => root.querySelector('#health-link').checked && root.querySelectorAll('input[type="number"]').length === 7 && root.querySelector('#health-memo').value === input.memo, 'InBody form displays metrics, link intent and literal memo.');
    root.innerHTML = renderHealthGraph([{ id: 'a', at: cb.measured_at, value: 70 }, { id: 'b', at: cw.measured_at, value: 69 }], { label: '체중', unit: 'kg' }, 'Asia/Seoul');
    await test('HEALTH-37-SVG', () => root.querySelectorAll('[data-point]').length === 2 && root.querySelector('svg').getAttribute('aria-label').includes('2회') && !root.innerHTML.includes('NaN'), 'Local SVG preserves same-day points and has accessible values.');
    root.innerHTML = renderHealthGraph([{ id: 'a', at: cb.measured_at, value: 70 }], { label: '체중', unit: 'kg' }, 'Asia/Seoul');
    await test('HEALTH-38-SINGLE-POINT', () => !/NaN|Infinity/.test(root.innerHTML) && root.querySelectorAll('circle').length === 1, 'Single point / flat series has finite chart coordinates.');
  } finally {
    failure = null; clearNavigationGuard(); root.remove();
    for (const c of containers) { c.database.close(); await new Promise((resolve, reject) => { const req = indexedDB.deleteDatabase(c.database.name); req.onsuccess = resolve; req.onerror = () => reject(req.error); }); }
  }
}

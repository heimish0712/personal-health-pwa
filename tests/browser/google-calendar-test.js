import { createContainer } from '../../js/bootstrap/container.js';
import { GoogleCalendarGateway } from '../../js/data/google/google-calendar.gateway.js';
import { GoogleTokenClient } from '../../js/data/google/google-token-client.js';
import { eventProperties } from '../../js/core/google-calendar.js';
import { canonicalJson } from '../../js/core/backup/canonical-json.js';
import { populateV1Relations } from './migration-harness.js';
import { IndexedDbDatabase } from '../../js/data/indexeddb/database.js';
import { applyMigrations } from '../../js/data/indexeddb/migrations.js';
import { requestToPromise as request } from '../../js/data/indexeddb/idb-request.js';
import { mountGoogleCalendar } from '../../js/pages/settings/google-calendar.page.js';

export async function runGoogleCalendarTests(test) {
  const containers = [], names = new Set(), events = new Map(), calls = [];
  let failure = null, lostResponse = false, httpFailure = null, beforeFetch = null;
  const token = { profile: null, denied: false, prepare: async () => {}, valid(p) { return this.profile === p; }, token(p) { if (!this.valid(p)) throw new Error('AUTH_REQUIRED'); return 'mock-token-never-persist'; }, clear() { this.profile = null; }, async authorize(p) { if (this.denied) throw new Error('OAUTH_FAILED'); this.profile = p; } };
  const response = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), { status });
  const gateway = new GoogleCalendarGateway({ fetcher: async (url, options) => {
    const u = new URL(url), method = options.method, body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method, path: u.pathname, query: u.searchParams.toString(), body });
    if (beforeFetch) { const fn = beforeFetch; beforeFetch = null; await fn(); }
    if (httpFailure) return response(httpFailure, { error: 'private Google response must never persist' });
    const id = u.pathname.split('/events/')[1];
    if (method === 'GET' && !id) return response(200, { items: [...events.values()].filter((row) => row.status !== 'cancelled' && u.searchParams.getAll('privateExtendedProperty').every((pair) => { const [k, v] = pair.split('='); return row.extendedProperties?.private?.[k] === v; })) });
    if (method === 'GET') return events.has(id) ? response(200, events.get(id)) : response(404, {});
    if (method === 'POST') {
      if (events.has(body.id)) return response(409, {});
      events.set(body.id, { ...body, status: 'confirmed' });
      if (lostResponse) { lostResponse = false; throw new TypeError('lost insert response'); }
      return response(200, events.get(body.id));
    }
    if (method === 'PATCH') { if (!events.has(id)) return response(404, {}); events.set(id, { ...events.get(id), ...body }); return response(200, events.get(id)); }
    if (method === 'DELETE') { if (!events.has(id)) return response(410, {}); events.set(id, { ...events.get(id), status: 'cancelled' }); return response(204); }
    throw new Error('unexpected mock request');
  } });
  const make = async (version = 3, name = `personal-health-pwa-test-google-${crypto.randomUUID()}`) => {
    const c = createContainer({ dbName: name, dbVersion: version, googleTokenClient: token, googleGateway: gateway,
      faultInjector(step) { if (failure === step) throw new Error('injected failure'); } });
    containers.push(c); names.add(name); await c.database.open(); await c.bootstrapService.initialize(); return c;
  };
  const reject = async (work) => { try { await work(); return false; } catch { return true; } };
  const all = (c, name) => c.database.runTransaction([name], 'readonly', ({ store }) => request(store(name).getAll()));
  const same = (a, b) => canonicalJson(a) === canonicalJson(b);
  const active = () => [...events.values()].filter((e) => e.status !== 'cancelled');
  try {
    const c = await make(), profile = c.identityContext.getCurrentProfileId(), type = (await c.exerciseQueryService.listActiveTypes())[0];
    const service = c.googleCalendarService, command = c.calendarIntegrationCommand;
    const data = { exercise_type_id: type.id, scheduled_at: '2026-09-08T01:00:00.000Z', expected_duration_minutes: 50, memo: 'PRIVATE HEALTH MEMO', status: 'scheduled' };
    const save = (extra = {}, row) => c.activityCommand.saveSchedule({ data: { ...data, ...extra }, id: row?.id, expectedRevision: row?.revision });
    let row = await save(); row = await save({ memo: 'OFF edit' }, row);
    row = await save({ status: 'cancelled' }, row);
    await test('GCAL-01-OFF', async () => calls.length === 0 && (await command.pending(profile)).length === 0 && !(await service.status()).enabled, 'OFF schedule create/edit/cancel are local only.');
    token.denied = true;
    await test('GCAL-02-DENIAL', async () => await reject(() => service.connect('mock')) && !(await service.status()).enabled, 'OAuth denial does not enable integration or undo local work.'); token.denied = false;
    await service.connect('mock');
    await test('GCAL-03-ON', async () => (await service.status()).enabled && (await service.status()).authorized && calls.length === 0, 'Explicit connect enables device setting; does not bulk upload historical schedules.');
    row = await save(); await service.retry();
    let link = (await all(c, 'calendar_event_links'))[0];
    await test('GCAL-04-INSERT', async () => active().length === 1 && link.schedule_id === row.id && (await service.status()).pending === 0, 'Create produces one primary event and portable link after commit.');
    await test('GCAL-05-PAYLOAD', () => { const e = active()[0]; return e.summary === type.name && e.description === '개인 건강 기록 앱의 운동 예약' && e.start.dateTime === data.scheduled_at && e.end.dateTime === '2026-09-08T01:50:00.000Z' && e.start.timeZone === 'Asia/Seoul' && same(e.extendedProperties.private, eventProperties(profile, row.id)) && !JSON.stringify(calls).includes('PRIVATE HEALTH MEMO'); }, 'Payload has exact duration/timezone/private IDs; no health memo.');
    row = await save({ expected_duration_minutes: 60 }, row); await service.retry();
    await test('GCAL-06-PATCH', () => active().length === 1 && active()[0].id === link.external_event_id && active()[0].end.dateTime === '2026-09-08T02:00:00.000Z' && calls.some((r) => r.method === 'PATCH'), 'Schedule edit patches same event ID.');
    const beforeRetry = calls.length; await service.retry();
    await test('GCAL-07-RETRY-IDEMPOTENT', () => calls.length === beforeRetry && active().length === 1, 'Done outbox is not resent.');
    row = await save({ status: 'cancelled' }, row); await service.retry();
    await test('GCAL-08-CANCEL', async () => active().length === 0 && (await all(c, 'calendar_event_links'))[0].status === 'deleted', 'Cancel deletes only linked app event, retains local schedule and link history.');
    row = await save({}, row); await service.retry();
    await test('GCAL-09-RECREATE', () => active().length === 1 && active()[0].id !== link.external_event_id, 'Reschedule after cancellation uses a new deterministic event generation.');
    const countBefore = calls.length;
    await c.passScheduleService.completeSchedule(row.id, { performed_at_local: '2026-09-08T10:00', values: { duration_minutes: 50 } }, row.revision);
    row = await c.passScheduleService.schedule(row.id); await service.retry();
    await test('GCAL-10-COMPLETE', () => calls.length === countBefore && active().length === 1, 'Completion creates local exercise only; no second Google event.');
    row = await c.passScheduleService.undoSchedule(row.id, row.revision);
    await service.retry();
    await test('GCAL-11-UNDO', () => calls.length === countBefore && active().length === 1, 'Undo completion does not duplicate or remove the reservation event.');
    const queued = await save(); await save({ status: 'cancelled' }, queued);
    const postCount = calls.filter((r) => r.method === 'POST').length; await service.retry();
    await test('GCAL-12-CANCEL-PENDING', () => calls.filter((r) => r.method === 'POST').length === postCount, 'Create then cancel before transmission never inserts an orphan.');
    let coalesced = await save(); for (let n = 1; n <= 3; n++) coalesced = await save({ expected_duration_minutes: 50 + n }, coalesced);
    await test('GCAL-13-COALESCE', async () => (await command.pending(profile)).length === 1, 'Repeated edits coalesce into one latest desired job.');
    await service.retry(); await test('GCAL-14-LATEST', () => active().find((e) => e.extendedProperties.private.scheduleUUID === coalesced.id).end.dateTime === '2026-09-08T01:53:00.000Z', 'Only latest duration is projected.');
    const lost = await save(); lostResponse = true; await service.retry();
    await test('GCAL-15-LOST-RESPONSE', async () => (await service.status()).pending === 1 && active().filter((e) => e.extendedProperties.private.scheduleUUID === lost.id).length === 1, 'Successful insert with lost response remains pending.');
    const posts = calls.filter((r) => r.method === 'POST').length; await service.retry();
    await test('GCAL-16-RECONCILE', async () => (await service.status()).pending === 0 && calls.filter((r) => r.method === 'POST').length === posts && calls.some((r) => r.query.includes('privateExtendedProperty=')), 'Private-property lookup reconciles missing link without another insert.');
    const ackLost = await save(); failure = 'calendar-before-ack'; await service.retry(); failure = null;
    await test('GCAL-17-ACK-ROLLBACK', async () => (await command.pending(profile)).length === 1 && !(await all(c, 'calendar_event_links')).some((l) => l.schedule_id === ackLost.id), 'Local acknowledgement failure rolls back link and queue acknowledgement.');
    const ackPosts = calls.filter((r) => r.method === 'POST').length; await service.retry();
    await test('GCAL-18-ACK-RECOVERY', async () => calls.filter((r) => r.method === 'POST').length === ackPosts && (await service.status()).pending === 0, 'Reconciliation after local transaction failure preserves one event.');
    const beforeAtomic = await all(c, 'exercise_schedules'), jobsBefore = await all(c, 'calendar_outbox'); failure = 'calendar-after-enqueue';
    const rejected = await reject(() => save()); failure = null;
    await test('GCAL-19-LOCAL-ATOMIC', async () => rejected && same(beforeAtomic, await all(c, 'exercise_schedules')) && same(jobsBefore, await all(c, 'calendar_outbox')), 'Failure after enqueue commits neither schedule nor pending job.');
    let denied = await save(); httpFailure = 500; await service.retry(); httpFailure = null;
    await test('GCAL-20-HTTP-FAILURE', async () => (await c.passScheduleService.schedule(denied.id)).id === denied.id && (await service.status()).pending === 1 && !(await service.status()).lastError.includes('private Google'), 'HTTP failure preserves local schedule and only safe error text.');
    httpFailure = 401; await service.retry(); httpFailure = null;
    await test('GCAL-21-AUTH-EXPIRED', async () => !(await service.status()).authorized && (await service.status()).enabled && await reject(() => service.retry()), 'Expired credentials leave ON and pending intact, require user re-auth.');
    const callsOff = calls.length; await service.disable(); await service.retry();
    await test('GCAL-22-OFF-RETAINS', async () => calls.length === callsOff && (await service.status()).pending === 1 && (await all(c, 'calendar_event_links')).length > 0, 'OFF never deletes Google events or historical links.');
    denied = await save({ status: 'cancelled' }, denied); await service.connect('mock');
    await test('GCAL-23-REENABLE-LATEST', () => !active().some((e) => e.extendedProperties.private.scheduleUUID === denied.id), 'Re-enable refreshes pending state from local cancel done while OFF.');
    const other = await c.repositories.profile.create({ display_name: 'Other', timezone: 'Asia/Seoul', seed_version: 1 }); c.identityContext.setCurrentProfileId(other.id);
    await test('GCAL-24-PROFILE', async () => !(await service.status()).enabled && !(await service.status()).authorized && (await service.status()).pending === 0 && await command.readJob(other.id, row.id) === null, 'Different Profile cannot use token, queue or links.'); c.identityContext.setCurrentProfileId(profile);
    const invalid = await save({ expected_duration_minutes: 0 }); await service.retry();
    await test('GCAL-25-INVALID-DURATION', async () => (await service.status()).lastError.includes('1440') && !active().some((e) => e.extendedProperties.private.scheduleUUID === invalid.id), 'Legacy invalid duration is explicit pending error, never defaulted.'); await save({ status: 'cancelled' }, invalid); await service.retry();
    let race = await save(); beforeFetch = async () => { race = await save({ expected_duration_minutes: 75 }, race); }; await service.retry();
    await test('GCAL-26-INFLIGHT-EDIT', async () => (await service.status()).pending === 1, 'Acknowledging an older in-flight version cannot drop a newer edit.'); await service.retry();
    await test('GCAL-27-INFLIGHT-LATEST', () => active().filter((e) => e.extendedProperties.private.scheduleUUID === race.id).length === 1 && active().find((e) => e.extendedProperties.private.scheduleUUID === race.id).end.dateTime === '2026-09-08T02:15:00.000Z', 'Next retry patches latest edit into same remote event.');
    const foreignJob = await save(); await service.retry();
    const foreignEvent = active().find((e) => e.extendedProperties.private.scheduleUUID === foreignJob.id);
    const originalProperties = foreignEvent.extendedProperties;
    foreignEvent.extendedProperties = { private: { app: 'another-app' } };
    await save({ expected_duration_minutes: 40 }, foreignJob); const mutations = calls.filter((x) => x.method !== 'GET').length; await service.retry();
    await test('GCAL-38-FOREIGN-EVENT', async () => calls.filter((x) => x.method !== 'GET').length === mutations && (await service.status()).lastError.includes('식별'), 'Foreign ownership on linked ID refuses patch/delete.');
    foreignEvent.extendedProperties = originalProperties; await service.retry();
    let externallyDeleted = await save(); await service.retry();
    const tombstone = active().find((e) => e.extendedProperties.private.scheduleUUID === externallyDeleted.id); tombstone.status = 'cancelled';
    externallyDeleted = await save({ expected_duration_minutes: 45 }, externallyDeleted); await service.retry();
    await test('GCAL-39-REMOTE-TOMBSTONE', () => active().filter((e) => e.extendedProperties.private.scheduleUUID === externallyDeleted.id).length === 1, 'User-deleted Google ID is not reused; later local edit projects a new generation.');
    await save(); const beforeLocked = calls.length;
    const locked = await c.coordinator.backup(() => reject(() => service.retry()));
    await test('GCAL-40-MAINTENANCE-LOCK', () => locked && calls.length === beforeLocked, 'Backup shared lock blocks remote side effects, including other cooperating tabs.'); await service.retry();
    const originalGetAll = IDBObjectStore.prototype.getAll; IDBObjectStore.prototype.getAll = function () { throw new Error('full store scan forbidden'); };
    try { await test('GCAL-41-INDEX', async () => (await service.status()).pending === 0 && (await command.pending(profile)).length === 0, 'Status and pending use Profile indexes without ObjectStore.getAll.'); } finally { IDBObjectStore.prototype.getAll = originalGetAll; }
    const exported = await c.backupExportService.exportCurrentProfile();
    await test('GCAL-28-BACKUP-PORTABLE', () => exported.document.source.schemaVersion === 2 && exported.document.data.calendar_event_links.length > 0 && !JSON.stringify(exported.document).includes('mock-token') && !Object.hasOwn(exported.document.data, 'calendar_outbox') && !Object.hasOwn(exported.document.data, 'device_settings'), 'Portable links included, outbox/device preferences/credentials excluded.');
    const target = await make(); const preview = await target.backupImportService.inspectFile(new Blob([exported.content])); await target.backupImportService.restorePreview(preview.id);
    await test('GCAL-29-RESTORE', async () => same(await all(c, 'calendar_event_links'), await all(target, 'calendar_event_links')) && !(await target.googleCalendarService.status()).enabled && (await target.googleCalendarService.status()).pending === 0, 'Restore preserves exact link UUID/revision/relation while OFF with no replay queue.');
    const linkBefore = await all(c, 'calendar_event_links'); c.database.close(); const reopened = await make(3, c.database.name); token.clear();
    await test('GCAL-30-REOPEN', async () => same(linkBefore, await all(reopened, 'calendar_event_links')) && (await reopened.googleCalendarService.status()).enabled && !(await reopened.googleCalendarService.status()).authorized, 'Reopen retains durable setting/links but no persisted access token.');
    const root = document.createElement('div'); document.body.append(root);
    await mountGoogleCalendar(root, { services: { googleCalendar: reopened.googleCalendarService }, isCurrent: () => true });
    await test('GCAL-31-SETTINGS', () => root.querySelector('#google-status').textContent.includes('재인증 필요') && root.querySelector('#google-off') && root.querySelector('#google-retry') && root.querySelector('#google-connect').disabled && !document.querySelector('script[src="https://accounts.google.com/gsi/client"]'), 'Settings exposes status/retry and does not load GIS without explicit gesture.'); root.remove();
    const old = await make(2); await populateV1Relations(old); const oldExport = await old.backupExportService.exportCurrentProfile(); const oldData = await old.backupSnapshotReader.readCurrentProfile(); const device = await old.repositories.deviceSettings.get('device_id'); old.database.close();
    const failDb = new IndexedDbDatabase({ name: old.database.name, version: 3, migrate(args) { applyMigrations(args); throw new Error('abort migration'); } });
    const abort = await reject(() => failDb.open()); failDb.close(); const unchanged = await make(2, old.database.name);
    await test('GCAL-32-MIGRATION-ABORT', async () => abort && same(oldData, await unchanged.backupSnapshotReader.readCurrentProfile()), 'DB2→3 aborted upgrade preserves all existing UUID/revision/tombstones/relations.'); unchanged.database.close();
    const upgraded = await make(3, old.database.name), snapshot = await upgraded.backupSnapshotReader.readCurrentProfile(); delete snapshot.data.calendar_event_links;
    await test('GCAL-33-MIGRATION', async () => same(oldData, snapshot) && same(device, await upgraded.repositories.deviceSettings.get('device_id')) && (await upgraded.database.inspectSchema()).storeNames.length === 17, 'Cumulative DB2→3 adds exactly link/outbox stores and preserves old rows/device identity.');
    const legacyTarget = await make(), lp = await legacyTarget.backupImportService.inspectFile(new Blob([oldExport.content])); await legacyTarget.backupImportService.restorePreview(lp.id);
    const restoredLegacy = await legacyTarget.backupSnapshotReader.readCurrentProfile(); delete restoredLegacy.data.calendar_event_links;
    await test('GCAL-34-OLD-BACKUP', () => same(oldData, restoredLegacy), 'Schema1 JSON restores to Schema2 without payload hash changes or lost records.');
    const reset = await reopened.backupImportService.prepareReplacement({ kind: 'reset', backupFirst: false }); await reopened.backupImportService.confirmReplacement(reset.id);
    await test('GCAL-35-RESET', async () => (await all(reopened, 'calendar_outbox')).length === 0 && (await all(reopened, 'calendar_event_links')).length === 0 && !(await reopened.googleCalendarService.status()).enabled, 'Explicit reset clears links/queue and disables integration with no Google deletes.');
    // Exercise actual GIS adapter with an injected GIS API, without loading external code.
    const previousGoogle = globalThis.google; let requested = null, options = null;
    globalThis.google = { accounts: { oauth2: { initTokenClient(o) { options = o; return { requestAccessToken(p) { requested = p; o.callback({ access_token: 'adapter-memory-only', expires_in: 3600 }); } }; }, hasGrantedAllScopes() { return true; } } } };
    try {
      const client = new GoogleTokenClient(); await client.authorize(profile, 'web-public-id');
      await test('GCAL-36-GIS', () => client.valid(profile) && !client.valid(other.id) && options.client_id === 'web-public-id' && options.scope.endsWith('/calendar.events.owned') && requested.prompt === 'select_account' && !JSON.stringify(client).includes('adapter-memory-only'), 'Actual GIS token adapter uses exact owned-events scope and private in-memory token.');
      const realNow = Date.now; Date.now = () => realNow() + 3600000;
      try { await test('GCAL-42-TOKEN-EXPIRY', () => !client.valid(profile), 'Actual token adapter rejects expired credentials without persisting them.'); } finally { Date.now = realNow; }
      client.clear(); await test('GCAL-37-TOKEN-CLEAR', () => !client.valid(profile), 'Clearing session invalidates token immediately.');
    } finally { globalThis.google = previousGoogle; }
  } finally {
    token.clear(); for (const c of containers) c.database.close();
    for (const name of names) await new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = resolve; r.onerror = () => reject(r.error); });
  }
}

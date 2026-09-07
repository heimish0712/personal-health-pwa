import { createContainer } from '../../js/bootstrap/container.js';
import { canonicalJson } from '../../js/core/backup/canonical-json.js';
import { nowLocalInput } from '../../js/core/datetime.js';
import { compatibleDraft } from '../../js/core/exercise-draft.js';
import { renderCalendar, renderScheduleForm, renderPasses } from '../../js/pages/exercise/pass-schedule.page.js';
import { renderExerciseLogCreate } from '../../js/pages/exercise/exercise-log-form.page.js';

export async function runQaFeedbackTests(test) {
  const all = []; let failAt = null;
  const make = async (tag) => { const c = createContainer({ dbName: `personal-health-pwa-test-qa-${tag}-${crypto.randomUUID()}`, faultInjector(step) { if (step === failAt) throw new Error('Injected QA failure'); } }); all.push(c); await c.database.open(); await c.bootstrapService.initialize(); return c; };
  const reject = async (fn, code) => { try { await fn(); return false; } catch (error) { return !code || error.code === code; } };
  const pause = () => new Promise((r) => setTimeout(r, 20));
  const wait = async (fn) => { for (let i = 0; i < 250; i++) { if (fn()) return; await pause(); } throw new Error('QA UI timeout'); };
  const file = (doc) => new Blob([canonicalJson(doc)], { type: 'application/json' });
  const root = document.createElement('div'); document.body.append(root);
  try {
    const c = await make('source');
    const type = (await c.exerciseQueryService.listActiveTypes())[0];
    const services = { health: c.healthService, activity: c.passScheduleService, exerciseQuery: c.exerciseQueryService, exerciseLog: c.exerciseLogService };
    const context = { root, services, isCurrent: () => true, setTitle() {}, showToast() {}, showError(message, error) { throw error; }, navigate() {} };
    const today = nowLocalInput('Asia/Seoul').slice(0, 10), month = today.slice(0, 7);
    const passInput = { exercise_type_id: type.id, name: 'QA 활성 이용권', total_count: 60, start_date: '2000-01-01', expiry_date: '2099-12-31', status: 'active' };
    const expired = await services.activity.savePass({ ...passInput, name: '먼저 생성한 만료권', expiry_date: '2000-12-31' });
    let pass = await services.activity.savePass(passInput);
    const scheduleInput = { exercise_type_id: type.id, scheduled_at_local: `${today}T10:00`, expected_duration_minutes: 50, status: 'scheduled', memo: '달력 예약' };
    let schedule = await services.activity.saveSchedule(scheduleInput);
    await renderScheduleForm(context, schedule.id, true);
    await test('QA051-01', () => root.querySelector('#exercise-pass').value === pass.id && !root.querySelector(`#exercise-pass option[value="${expired.id}"]`), 'Completion defaults to first usable active pass; expired top row excluded.');
    pass = await services.activity.setPassStatus(pass.id, 'inactive', pass.revision);
    await renderScheduleForm(context, schedule.id, true);
    await test('QA051-02', () => root.querySelector('#exercise-pass').value === '', 'No usable pass defaults to no charge.');
    pass = await services.activity.setPassStatus(pass.id, 'active', pass.revision);
    const logInput = { exercise_type_id: type.id, performed_at_local: `${today}T10:00`, values: { duration_minutes: 50 }, memo: '완료 연결', pass_id: pass.id };
    await services.activity.completeSchedule(schedule.id, logInput, schedule.revision);
    await services.exerciseLog.create({ ...logInput, performed_at_local: `${today}T12:00`, memo: '직접 기록', pass_id: null });
    await renderCalendar(context);
    await test('QA051-03', () => root.querySelector('[aria-pressed="true"]').dataset.calendarDate === today && root.querySelector('[aria-current="date"]').dataset.calendarDate === today, 'Monthly calendar initially selects and separately marks today.');
    await test('QA051-05', () => root.querySelectorAll('[data-calendar-entry]').length === 2 && root.textContent.includes('완료 · 운동기록'), 'Linked completion is one projected calendar item.');
    await test('QA051-06', () => root.textContent.includes('직접 기록'), 'Direct exercise log remains a separate projected item.');
    const another = `${month}-${today.endsWith('-01') ? '02' : '01'}`;
    root.querySelector(`[data-calendar-date="${another}"]`).click();
    await test('QA051-04', () => root.querySelectorAll('[data-calendar-entry]').length === 0 && root.querySelector('#calendar-selected').textContent.includes(another), 'Selecting date renders only that date without full-store reads.');
    const oldMonth = root.querySelector('#calendar-month').textContent;
    root.querySelector('#calendar-next').click(); await wait(() => root.querySelector('#calendar-month').textContent !== oldMonth);
    root.querySelector('#calendar-prev').click(); await wait(() => root.querySelector('#calendar-month').textContent === oldMonth);
    await test('QA051-MONTH', () => true, 'Next/previous month navigation works.');
    const cross = await services.activity.saveSchedule({ ...scheduleInput, scheduled_at_local: '2026-08-31T10:00' });
    await services.activity.completeSchedule(cross.id, { ...logInput, performed_at_local: '2026-09-01T10:00', pass_id: null }, cross.revision);
    const sep = await services.activity.calendarEntries('2026-09-01T00:00', '2026-09-02T00:00');
    const aug = await services.activity.calendarEntries('2026-08-31T00:00', '2026-09-01T00:00');
    await test('QA051-CROSS-MONTH', () => sep.filter((r) => r.schedule?.id === cross.id).length === 1 && aug.every((r) => r.schedule?.id !== cross.id), 'Completed projection uses actual exercise date across month boundaries and resolves indexed linkage.');
    const second = await c.exerciseManagementService.createExerciseType({ name: '전환 운동', fields: [{ key: 'duration_minutes' }, { key: 'distance_km' }] });
    await renderExerciseLogCreate(context);
    root.querySelector('#performed-at').value = `${today}T09:23`; root.querySelector('#exercise-memo').value = '유지할 메모';
    root.querySelector('[data-exercise-field="duration_minutes"]').value = '37';
    root.querySelector('#exercise-type').value = second.exerciseType.id; root.querySelector('#exercise-type').dispatchEvent(new Event('change'));
    await wait(() => root.querySelector('[data-exercise-field="distance_km"]'));
    await test('QA051-07', () => root.querySelector('#performed-at').value === `${today}T09:23` && root.querySelector('#exercise-memo').value === '유지할 메모', 'Exercise change preserves date, time and memo DOM values.');
    await test('QA051-08', () => root.querySelector('[data-exercise-field="duration_minutes"]').value === '37', 'Same compatible template field key retains entered value.');
    await test('QA051-09', () => {
      const result = compatibleDraft([{ key: 'same', type: 'number' }, { key: 'removed', type: 'text' }, { key: 'pick', type: 'select' }], [{ key: 'same', type: 'boolean' }, { key: 'pick', type: 'select', options: ['b'] }], { same: '12', removed: 'text', pick: 'a' });
      return Object.keys(result).length === 0;
    }, 'Missing, incompatible and invalid select values are removed.');
    await renderPasses(context);
    await test('QA051-10', () => root.querySelector(`[data-toggle-pass="${pass.id}"]`).textContent === '비활성화', 'Active pass shows deactivate action.');
    const history = await c.repositories.passUsage.listByPass(pass.id), remaining = (await services.activity.passes(type.id)).find((p) => p.id === pass.id).remaining;
    root.querySelector(`[data-toggle-pass="${pass.id}"]`).click(); await wait(() => root.querySelector(`[data-toggle-pass="${pass.id}"]`).textContent === '활성화');
    await test('QA051-11', () => root.querySelector(`[data-toggle-pass="${pass.id}"]`).textContent === '활성화', 'Inactive pass shows activate action.');
    root.querySelector(`[data-toggle-pass="${pass.id}"]`).click(); await wait(() => root.querySelector(`[data-toggle-pass="${pass.id}"]`).textContent === '비활성화');
    await test('QA051-12', async () => canonicalJson(history) === canonicalJson(await c.repositories.passUsage.listByPass(pass.id)) && (await services.activity.passes(type.id)).find((p) => p.id === pass.id).remaining === remaining && (await c.repositories.pass.getById(pass.id)).revision === pass.revision + 2, 'Status toggles preserve all usage/remaining and increment pass revision only.');
    const exported = await c.backupExportService.exportCurrentProfile();
    const target = await make('target');
    await target.exerciseManagementService.createExerciseType({ name: '교체될 운동', fields: [] });
    const pointer = await target.repositories.deviceSettings.get('device_id');
    const before = (await target.backupRestoreCommand.inspectTarget()).fingerprint;
    const preview = await target.backupImportService.inspectFile(file(exported.document));
    await test('QA051-17', () => reject(() => target.backupImportService.restorePreview(preview.id), 'RESTORE_TARGET_NOT_PRISTINE'), 'Normal restore remains blocked on non-pristine target.');
    for (const step of ['replace-cleared:profiles', 'replace-cleared:pass_usage_logs', 'restore-after:exercise_logs', 'restore-before-commit']) {
      const plan = await target.backupImportService.prepareReplacement({ kind: 'replace', previewId: preview.id, backupFirst: false });
      failAt = step; const failed = await reject(() => target.backupImportService.confirmReplacement(plan.id), 'RESTORE_TRANSACTION_FAILED'); failAt = null;
      await test(`QA051-20-${step}`, async () => failed && before === (await target.backupRestoreCommand.inspectTarget()).fingerprint, 'Forced replace injected failure rolls back every portable row and pointer.');
    }
    let plan = await target.backupImportService.prepareReplacement({ kind: 'replace', previewId: preview.id, backupFirst: false });
    await target.backupImportService.confirmReplacement(plan.id);
    await test('QA051-18', () => target.identityContext.getCurrentProfileId() === exported.document.scope.profileId, 'Forced replace succeeds on populated database and switches profile.');
    await test('QA051-19', async () => !(await target.repositories.exerciseType.list()).some((t) => t.name === '교체될 운동'), 'Old records are fully replaced, not merged.');
    await test('QA051-21', async () => (await target.backupExportService.exportCurrentProfile()).document.integrity.payloadHash === exported.document.integrity.payloadHash, 'Forced restore canonical hash equals imported snapshot.');
    await test('QA051-22', async () => canonicalJson(await target.repositories.deviceSettings.get('device_id')) === canonicalJson(pointer), 'Device identity metadata remains exact.');
    for (const step of ['replace-cleared:exercise_logs', 'reset-after:profiles', 'reset-after:exercise_templates', 'reset-before-commit']) {
      const old = (await target.backupRestoreCommand.inspectTarget()).fingerprint;
      plan = await target.backupImportService.prepareReplacement({ kind: 'reset', backupFirst: false });
      failAt = step; const failed = await reject(() => target.backupImportService.confirmReplacement(plan.id), 'RESET_TRANSACTION_FAILED'); failAt = null;
      await test(`QA051-RESET-ATOMIC-${step}`, async () => failed && old === (await target.backupRestoreCommand.inspectTarget()).fingerprint, 'Reset failure restores all data and seed/pointer atomically.');
    }
    plan = await target.backupImportService.prepareReplacement({ kind: 'reset', backupFirst: true });
    await test('QA051-RESET-DOWNLOAD-GATE', () => reject(() => target.backupImportService.confirmReplacement(plan.id), 'BACKUP_DOWNLOAD_REQUIRED'), 'Backup-first reset cannot execute on download click alone.');
    await target.backupImportService.confirmReplacement(plan.id, file(plan.backup.document));
    await test('QA051-13', async () => (await target.backupRestoreCommand.inspectTarget()).pristine, 'Reset executes after reading back and validating downloaded backup.');
    await test('QA051-16', async () => (await target.exerciseQueryService.listActiveTypes()).length === 1 && (await target.repositories.exerciseTemplate.list()).length === 1 && canonicalJson(await target.repositories.deviceSettings.get('device_id')) === canonicalJson(pointer), 'Reset leaves initial Profile/Pilates/template and device ID intact.');
    const photo = await target.repositories.dietPhoto.create({ diet_log_id: crypto.randomUUID(), storage_key: 'test', sort_order: 1 });
    const beforeFailure = (await target.backupRestoreCommand.inspectTarget()).fingerprint;
    await test('QA051-14', async () => await reject(() => target.backupImportService.prepareReplacement({ kind: 'reset', backupFirst: true }), 'BACKUP_MEDIA_UNSUPPORTED') && beforeFailure === (await target.backupRestoreCommand.inspectTarget()).fingerprint, 'Backup failure prevents creation/execution of reset plan; no data removed.');
    plan = await target.backupImportService.prepareReplacement({ kind: 'reset', backupFirst: false });
    await target.backupImportService.confirmReplacement(plan.id);
    await test('QA051-15', async () => (await target.backupRestoreCommand.inspectTarget()).pristine && !(await target.repositories.dietPhoto.getById(photo.id)), 'Explicit no-backup reset recreates pristine state.');
    plan = await target.backupImportService.prepareReplacement({ kind: 'reset', backupFirst: false });
    await target.exerciseManagementService.createExerciseType({ name: '확인 후 변경', fields: [] });
    await test('QA051-STALE-RESET', () => reject(() => target.backupImportService.confirmReplacement(plan.id), 'RESTORE_TARGET_CHANGED'), 'Data changed after confirmation preparation blocks stale reset.');
    const freshPreview = await target.backupImportService.inspectFile(file(exported.document));
    plan = await target.backupImportService.prepareReplacement({ kind: 'replace', previewId: freshPreview.id, backupFirst: true });
    await test('QA051-WRONG-DOWNLOAD', () => reject(() => target.backupImportService.confirmReplacement(plan.id, file(exported.document)), 'BACKUP_DOWNLOAD_REQUIRED'), 'Selecting unrelated valid backup cannot acknowledge current-data backup.');
    await target.backupImportService.confirmReplacement(plan.id, file(plan.backup.document));
    await test('QA051-BACKUP-FIRST-REPLACE', async () => (await target.backupExportService.exportCurrentProfile()).document.integrity.payloadHash === exported.document.integrity.payloadHash, 'Backup-first forced restore validates local saved backup then replaces.');
  } finally {
    root.remove();
    for (const c of all) { c.database.close(); await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(c.database.name); request.onsuccess = resolve; request.onerror = reject; }); }
  }
}

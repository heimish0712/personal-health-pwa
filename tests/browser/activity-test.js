import { createContainer } from '../../js/bootstrap/container.js';
import { canonicalJson } from '../../js/core/backup/canonical-json.js';
export async function runActivityTests(test) {
  const name = `personal-health-pwa-test-activity-${crypto.randomUUID()}`;
  let failAt = null;
  let c = createContainer({ dbName: name, faultInjector(step) { if (step === failAt) throw new Error('Injected activity failure'); } });
  const rejects = async (work, code) => { try { await work(); return false; } catch (error) { return !code || error.code === code; } };
  try {
    await c.database.open(); await c.bootstrapService.initialize();
    const type = (await c.exerciseQueryService.listActiveTypes())[0];
    const a = c.passScheduleService;
    let pass = await a.savePass({ exercise_type_id: type.id, name: '60회 테스트', total_count: 60, start_date: '2026-01-01', expiry_date: '2026-12-31', status: 'active' });
    const input = { exercise_type_id: type.id, performed_at_local: '2026-09-07T10:00', values: { duration_minutes: 50 }, memo: '', pass_id: pass.id };
    const remaining = async (id = pass.id) => (await c.passScheduleService.passes(type.id)).find((p) => p.id === id).remaining;
    const snapshot = async () => canonicalJson((await c.backupExportService.exportCurrentProfile()).document.data);
    await test('PASS-001', async () => await remaining() === 60, 'Initial pass has 60 calculated uses.');
    let log = await c.exerciseLogService.create(input);
    const usageId = (await c.repositories.passUsage.listByLog(log.id))[0].id;
    await test('PASS-002', async () => await remaining() === 59, 'Exercise debits once: 60 -> 59.');
    log = await c.exerciseLogService.update(log.id, { ...input, memo: '수정' }, log.revision);
    await test('PASS-003', async () => await remaining() === 59 && (await c.repositories.passUsage.listByLog(log.id))[0].revision === 1, 'Same pass edit neither adds nor mutates usage.');
    log = await c.exerciseLogService.update(log.id, { ...input, pass_id: null }, log.revision);
    await test('PASS-004', async () => await remaining() === 60, 'Removing selection cancels usage.');
    log = await c.exerciseLogService.update(log.id, input, log.revision);
    await test('PASS-005', async () => { const rows = await c.repositories.passUsage.listByLog(log.id); return await remaining() === 59 && rows.length === 1 && rows[0].id === usageId && rows[0].status === 'used'; }, 'Reapply reactivates same cancelled usage ID.');
    log = await c.exerciseLogService.softDelete(log.id, log.revision);
    await test('PASS-006', async () => await remaining() === 60, 'Delete restores capacity.');
    log = await c.exerciseLogService.restore(log.id, log.revision);
    await test('PASS-007', async () => await remaining() === 59, 'Restore revalidates and debits.');
    const otherPass = await a.savePass({ ...pass, name: 'B 이용권', total_count: 1 });
    log = await c.exerciseLogService.update(log.id, { ...input, pass_id: otherPass.id }, log.revision);
    await test('PASS-008', async () => await remaining() === 60 && await remaining(otherPass.id) === 0 && (await c.repositories.passUsage.listByLog(log.id)).filter((r) => r.status === 'used').length === 1, 'Switch cancels A and activates B atomically; max one active.');
    log = await c.exerciseLogService.update(log.id, input, log.revision);
    await test('PASS-009', async () => await remaining() === 59 && (await c.repositories.passUsage.listByLog(log.id)).length === 2, 'A -> B -> A keeps pair identity and cancelled B history.');
    await test('PASS-010', () => rejects(() => c.exerciseLogService.update(log.id, { ...input, performed_at_local: '2027-01-01T00:00' }, log.revision), 'PASS_EXPIRED'), 'Actual exercise date outside expiry rejects edit without removing existing usage.');
    await test('PASS-011', async () => await remaining() === 59, 'Rejected date edit preserves previous charge.');
    await test('PASS-012', () => rejects(() => a.savePass({ ...pass, total_count: 0 }, pass.id, pass.revision), 'PASS_COUNT'), 'Invalid total is rejected.');
    const second = await c.exerciseLogService.create(input);
    await test('PASS-013', () => rejects(() => a.savePass({ ...pass, total_count: 1 }, pass.id, pass.revision), 'PASS_COUNT_USED'), 'Total cannot be less than two active uses.');
    await c.exerciseLogService.softDelete(second.id, second.revision);
    await test('PASS-014', () => rejects(() => a.savePass({ ...pass, start_date: '2026-10-01' }, pass.id, pass.revision), 'PASS_DATES_USED'), 'Pass date edits cannot exclude existing used exercise day.');
    pass = await a.deletePass(pass.id, pass.revision);
    await test('PASS-015', () => pass.status === 'inactive' && pass.deleted_at === null, 'Pass with history is deactivated, not deleted.');
    log = await c.exerciseLogService.update(log.id, input, log.revision);
    await test('PASS-016', async () => await remaining() === 59, 'Existing charge remains editable on inactive pass.');
    log = await c.exerciseLogService.softDelete(log.id, log.revision);
    await test('PASS-017', () => rejects(() => c.exerciseLogService.restore(log.id, log.revision), 'PASS_INACTIVE'), 'Restore cannot recharge inactive pass.');
    pass = await a.savePass({ ...pass, status: 'active' }, pass.id, pass.revision);
    const scheduleInput = { exercise_type_id: type.id, scheduled_at_local: '2026-09-07T10:00', expected_duration_minutes: 50, memo: '', status: 'scheduled' };
    let schedule = await a.saveSchedule(scheduleInput);
    schedule = await a.saveSchedule({ ...scheduleInput, memo: '수정' }, schedule.id, schedule.revision);
    schedule = await a.cancelSchedule(schedule.id, schedule.revision);
    await test('SCHEDULE-001', async () => await remaining() === 60, 'Schedule create/edit/cancel never debit.');
    schedule = await a.saveSchedule(scheduleInput, schedule.id, schedule.revision);
    const revision = schedule.revision;
    const completed = await Promise.all([a.completeSchedule(schedule.id, input, revision), a.completeSchedule(schedule.id, input, revision)]);
    schedule = await a.schedule(schedule.id);
    await test('SCHEDULE-002', async () => completed[0].id === completed[1].id && await remaining() === 59, 'Concurrent duplicate completion creates one log and usage.');
    await test('SCHEDULE-003', () => rejects(() => c.exerciseLogService.softDelete(completed[0].id, completed[0].revision), 'SCHEDULE_LINKED'), 'Linked completed log must be undone through schedule command.');
    schedule = await a.undoSchedule(schedule.id, schedule.revision);
    await test('SCHEDULE-004', async () => schedule.status === 'scheduled' && await remaining() === 60 && (await c.repositories.exerciseLog.getByIdIncludingDeleted(completed[0].id)).deleted_at !== null, 'Undo atomically restores schedule and capacity, soft-deletes log.');
    await test('SCHEDULE-005', () => rejects(() => a.completeSchedule(schedule.id, input, revision), 'REVISION_CONFLICT'), 'Stale retry after undo cannot complete again.');
    await test('SCHEDULE-006', async () => { const row = await c.repositories.exerciseLog.getByIdIncludingDeleted(completed[0].id); return rejects(() => c.exerciseLogService.restore(row.id, row.revision), 'SCHEDULE_LINKED'); }, 'Direct restore cannot reactivate cancelled schedule log.');
    const again = await a.completeSchedule(schedule.id, input, schedule.revision);
    await test('SCHEDULE-007', async () => again.id === completed[0].id && await remaining() === 59, 'Explicit re-complete restores same log and usage identity.');
    schedule = await a.schedule(schedule.id);
    for (const step of ['activity-after-log', 'activity-after-cancel', 'activity-after-usage', 'activity-after-schedule']) {
      const before = await snapshot(); failAt = step;
      const failed = await rejects(() => a.undoSchedule(schedule.id, schedule.revision)); failAt = null;
      await test(`ATOMIC-UNDO-${step}`, async () => failed && before === await snapshot(), 'Injected undo failure leaves complete portable data identical.');
    }
    schedule = await a.undoSchedule(schedule.id, schedule.revision);
    for (const step of ['activity-after-log', 'activity-after-cancel', 'activity-after-usage', 'activity-after-schedule']) {
      const before = await snapshot(); failAt = step;
      const failed = await rejects(() => a.completeSchedule(schedule.id, input, schedule.revision)); failAt = null;
      await test(`ATOMIC-COMPLETE-${step}`, async () => failed && before === await snapshot(), 'Injected completion failure creates no partial data.');
    }
    log = await c.exerciseLogService.restore(log.id, log.revision);
    for (const step of ['activity-after-log', 'activity-after-cancel', 'activity-after-usage']) {
      const before = await snapshot(); failAt = step;
      const failed = await rejects(() => c.exerciseLogService.update(log.id, { ...input, pass_id: otherPass.id }, log.revision)); failAt = null;
      await test(`ATOMIC-SWITCH-${step}`, async () => failed && before === await snapshot(), 'Injected pass switch failure preserves original log and all usage rows.');
    }
    await c.exerciseLogService.softDelete(log.id, log.revision);
    const one = await Promise.allSettled([c.exerciseLogService.create({ ...input, pass_id: otherPass.id }), c.exerciseLogService.create({ ...input, pass_id: otherPass.id })]);
    await test('PASS-CONCURRENT-LAST', async () => one.filter((r) => r.status === 'fulfilled').length === 1 && one.filter((r) => r.status === 'rejected').length === 1 && await remaining(otherPass.id) === 0, 'Concurrent last-use claims allow exactly one complete write.');
    const different = await c.exerciseManagementService.createExerciseType({ name: '다른 운동', fields: [{ key: 'duration_minutes' }] });
    await test('PASS-WRONG-TYPE', () => rejects(() => c.exerciseLogService.create({ ...input, exercise_type_id: different.exerciseType.id }), 'PASS_EXERCISE'), 'Cross-exercise pass selection rejected.');
    await test('PASS-DATE-BOUNDARY', async () => { const row = await c.exerciseLogService.create({ ...input, performed_at_local: '2026-01-01T00:00' }); return row.performed_at === '2025-12-31T15:00:00.000Z'; }, 'Validity uses Seoul exercise day, inclusive start, not UTC day or today.');
    const range = await a.calendar('2026-09-07T00:00', '2026-09-08T00:00');
    await test('QUERY-ACTIVITY-RANGE', () => range.schedules.length === 1 && range.logs.length === 1, 'Existing compound date indexes return scoped live schedules/logs for period.');
    const before = await snapshot();
    c.database.close(); c = createContainer({ dbName: name }); await c.database.open(); await c.bootstrapService.initialize();
    await test('ACTIVITY-REOPEN', async () => before === await snapshot(), 'Database reopen preserves complete pass/schedule state and revisions.');
    const withoutPass = await c.passScheduleService.saveSchedule(scheduleInput);
    const noCharge = await c.passScheduleService.completeSchedule(withoutPass.id, { ...input, pass_id: null }, withoutPass.revision);
    await test('SCHEDULE-OPTIONAL-PASS', async () => (await c.repositories.passUsage.listByLog(noCharge.id)).length === 0, 'Schedule completion without pass creates only an exercise log.');
    await test('SCHEDULE-COMPLETED-EDIT', () => rejects(() => c.passScheduleService.saveSchedule(scheduleInput, withoutPass.id, withoutPass.revision + 1), 'SCHEDULE_COMPLETED'), 'Completed schedule cannot be edited without undo.');
    await test('ACTIVITY-INVALID-DATE', () => rejects(() => c.passScheduleService.saveSchedule({ ...scheduleInput, scheduled_at_local: '2026-02-30T10:00' }), 'DATETIME_INVALID'), 'Impossible local dates are rejected, not normalized.');
    const ownProfile = c.identityContext.getCurrentProfileId();
    const foreign = await c.repositories.profile.create({ display_name: '다른 프로필', timezone: 'Asia/Seoul', seed_version: 1 });
    c.identityContext.setCurrentProfileId(foreign.id);
    await test('ACTIVITY-SCOPE-PASS', () => rejects(() => c.passScheduleService.deletePass(pass.id, pass.revision), 'ENTITY_NOT_FOUND'), 'Command cannot mutate another profile pass.');
    await test('ACTIVITY-SCOPE-QUERY', async () => (await c.passScheduleService.passes(type.id)).length === 0, 'Indexed pass query is profile-scoped.');
    c.identityContext.setCurrentProfileId(ownProfile);
    const exhaustedLog = one.find((r) => r.status === 'fulfilled').value;
    const removed = await c.exerciseLogService.softDelete(exhaustedLog.id, exhaustedLog.revision);
    await c.exerciseLogService.create({ ...input, pass_id: otherPass.id });
    await test('PASS-RESTORE-EXHAUSTED', () => rejects(() => c.exerciseLogService.restore(removed.id, removed.revision), 'PASS_EXHAUSTED'), 'Restore rechecks capacity used by a later exercise.');
    await test('PASS-RESTORE-ROLLBACK', async () => (await c.repositories.exerciseLog.getByIdIncludingDeleted(removed.id)).deleted_at !== null, 'Failed restore leaves deleted state and usage unchanged.');
    const exported = await c.backupExportService.exportCurrentProfile();
    const target = createContainer({ dbName: `${name}-restore` });
    try {
      await target.database.open(); await target.bootstrapService.initialize();
      const prepared = await target.backupImportService.inspectFile(new Blob([JSON.stringify(exported.document)]));
      await target.backupImportService.restorePreview(prepared.id);
      await test('ACTIVITY-BACKUP', async () => (await target.backupExportService.exportCurrentProfile()).document.integrity.payloadHash === exported.document.integrity.payloadHash, 'Backup v1 restores all pass selections, cancelled history and undone schedule links with exact hash.');
    } finally { target.database.close(); await new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase(`${name}-restore`); r.onsuccess = resolve; r.onerror = reject; }); }
  } finally {
    c.database.close(); await new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = resolve; r.onerror = reject; });
  }
}

import { createContainer } from '../../js/bootstrap/container.js';
import { canonicalJson } from '../../js/core/backup/canonical-json.js';
import { payloadHash, snapshotPayload } from '../../js/core/backup/backup-integrity.js';

export async function runBackupBrowserTests(test) {
  const containers = [];
  const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
  const file = (document) => new Blob([canonicalJson(document)], { type: 'application/json' });
  const rejects = async (work, code) => { try { await work(); return false; } catch (e) { return e.code === code; } };
  async function make(label, faultInjector = null) {
    let time = Date.parse('2026-09-07T00:00:00.000Z');
    const c = createContainer({ dbName: `personal-health-pwa-test-backup-${label}-${crypto.randomUUID()}`, clock: { nowIso() { const value = new Date(time).toISOString(); time += 1000; return value; } }, faultInjector });
    containers.push(c); await c.database.open(); await c.bootstrapService.initialize(); return c;
  }
  try {
    const source = await make('source');
    const profileId = source.identityContext.getCurrentProfileId();
    const running = await source.exerciseManagementService.createExerciseType({ name: '러닝', fields: [{ key: 'duration_minutes' }] });
    let oldLog = await source.exerciseLogService.create({ exercise_type_id: running.exerciseType.id, performed_at_local: '2026-09-06T10:00', values: { duration_minutes: 35 }, memo: '  과거 메모 <>&  ' });
    for (let i = 0; i < 2; i++) oldLog = await source.exerciseLogService.update(oldLog.id, { performed_at_local: '2026-09-06T10:00', values: { duration_minutes: 36 + i }, memo: '  수정 revision 3  ' }, oldLog.revision);
    await source.exerciseManagementService.createTemplateVersion(running.exerciseType.id, [{ key: 'duration_minutes' }, { key: 'distance_km' }], { expectedTemplateId: running.template.id, expectedTemplateRevision: running.template.revision });
    const newLog = await source.exerciseLogService.create({ exercise_type_id: running.exerciseType.id, performed_at_local: '2026-09-07T10:00', values: { duration_minutes: 45, distance_km: 6 }, memo: '삭제된 기록' });
    await source.exerciseLogService.softDelete(newLog.id, newLog.revision);
    const removed = await source.exerciseManagementService.createExerciseType({ name: '삭제된 운동', fields: [] });
    await source.exerciseManagementService.softDeleteExerciseType(removed.exerciseType.id, 1);
    const measuredAt = '2026-09-06T01:00:00.000Z';
    const inbody = await source.repositories.inbody.create({ measured_at: measuredAt, weight: 65.5 });
    await source.repositories.weight.create({ measured_at: measuredAt, weight: 65.5, source: 'inbody', source_ref_id: inbody.id, memo: '측정' });
    const diet = await source.repositories.dietLog.create({ eaten_at: measuredAt, meal_type: 'lunch', memo: '가상 식단' });
    await source.repositories.userSettings.create({ key: 'test-setting', value: { nested: ['preserved', true] } });
    const pass = await source.repositories.pass.create({ exercise_type_id: running.exerciseType.id, name: '가상 이용권', total_count: 10, start_date: '2026-09-01', expiry_date: '2026-12-31', status: 'active' });
    await source.repositories.passUsage.create({ pass_id: pass.id, exercise_log_id: oldLog.id, used_count: 1, status: 'used' });
    await source.repositories.exerciseSchedule.create({ exercise_type_id: running.exerciseType.id, scheduled_at: measuredAt, status: 'completed', completed_exercise_log_id: oldLog.id });
    const other = await source.repositories.profile.create({ display_name: '다른 Profile', timezone: 'Asia/Seoul', seed_version: 1 });
    source.identityContext.setCurrentProfileId(other.id);
    await source.exerciseManagementService.createExerciseType({ name: '다른 Profile 전용', fields: [] });
    source.identityContext.setCurrentProfileId(profileId);
    const exported = await source.backupExportService.exportCurrentProfile();
    const document = exported.document;
    globalThis.__BACKUP_TEST_DOCUMENT__ = document;
    const expCases = [
      ['001', () => document.data.profiles.length === 1 && document.scope.profileId === profileId],
      ['002', () => Object.entries(document.data).every(([name, rows]) => rows.every((row) => name === 'profiles' ? row.id === profileId : row.profile_id === profileId))],
      ['003', () => document.data.exercise_logs.some((row) => row.id === newLog.id && row.deleted_at !== null)],
      ['004', () => document.data.exercise_templates.some((row) => row.id === running.template.id && row.status === 'superseded')],
      ['005', () => document.data.exercise_logs.find((row) => row.id === oldLog.id).revision === 3],
      ['006', () => equal(document.data.exercise_logs.find((row) => row.id === oldLog.id), oldLog)],
      ['007', () => Object.values(document.data).every((rows) => rows.every((row, i) => i === 0 || rows[i - 1].id <= row.id))],
      ['008', () => Object.keys(document.data).every((name) => document.counts[name] === document.data[name].length)],
      ['009', async () => await payloadHash(document) === document.integrity.payloadHash],
      ['010', () => !Object.hasOwn(document.data, 'device_settings')],
      ['011', () => !Object.hasOwn(document.data, 'app_logs')]
    ];
    for (const [id, work] of expCases) await test(`BACKUP-EXP-${id}`, work, 'Actual IndexedDB export snapshot checked.');
    await source.repositories.dietPhoto.create({ diet_log_id: diet.id, storage_key: 'synthetic-photo', sort_order: 1 });
    await test('BACKUP-EXP-012', () => rejects(() => source.backupExportService.exportCurrentProfile(), 'BACKUP_MEDIA_UNSUPPORTED'), 'Photo metadata prevents a falsely complete v1 export.');
    const target = await make('target');
    const deviceBefore = await target.repositories.deviceSettings.get('device_id');
    const preview = await target.backupImportService.inspectFile(file(document));
    await test('RESTORE-001', async () => { if (!preview.pristine) return false; await target.backupImportService.restorePreview(preview.id); return true; }, 'Pristine seeded database restored via 13-store command.');
    const restored = await target.backupSnapshotReader.readCurrentProfile();
    await test('RESTORE-002', () => restored.profileId === profileId, 'Original Profile ID preserved.');
    for (const [id, key] of [['003', 'id'], ['004', 'created_at'], ['005', 'updated_at'], ['006', 'deleted_at'], ['007', 'revision']]) {
      await test(`RESTORE-${id}`, () => Object.keys(document.data).every((name) => equal(document.data[name].map((row) => row[key]), restored.data[name].map((row) => row[key]))), `${key} preserved for every portable row.`);
    }
    await test('RESTORE-008', () => equal(document.data.exercise_logs, restored.data.exercise_logs), 'Template references and dynamic values preserved.');
    await test('RESTORE-009', () => equal(document.data.exercise_templates, restored.data.exercise_templates), 'Historical templates preserved.');
    await test('RESTORE-010', () => restored.data.exercise_logs.some((row) => row.deleted_at !== null) && restored.data.exercise_types.some((row) => row.deleted_at !== null), 'Deleted rows remain deleted.');
    await test('RESTORE-011', async () => equal(deviceBefore, await target.repositories.deviceSettings.get('device_id')), 'Device ID and device metadata untouched.');
    await test('RESTORE-012', async () => (await target.repositories.deviceSettings.get('current_profile_id')).value === profileId, 'Current Profile pointer is restored.');
    await test('RESTORE-013', async () => {
      const next = await target.backupImportService.inspectFile(file(document));
      return !next.pristine && await rejects(() => target.backupImportService.restorePreview(next.id), 'RESTORE_TARGET_NOT_PRISTINE');
    }, 'Valid file can be previewed on a populated target but cannot be written.');
    await test('RESTORE-014', async () => {
      for (const checkpoint of ['restore-after-seed-removal', 'restore-after:profiles', 'restore-row:exercise_logs', 'restore-after:weight_logs', 'restore-before-commit']) {
        const c = await make('rollback', (name) => { if (name === checkpoint) throw Error('Injected restore failure'); });
        const before = await c.backupSnapshotReader.readCurrentProfile();
        const pointer = await c.repositories.deviceSettings.get('current_profile_id');
        const p = await c.backupImportService.inspectFile(file(document));
        if (!await rejects(() => c.backupImportService.restorePreview(p.id), 'RESTORE_TRANSACTION_FAILED')) return false;
        if (!equal(before, await c.backupSnapshotReader.readCurrentProfile()) || !equal(pointer, await c.repositories.deviceSettings.get('current_profile_id'))) return false;
      }
      return true;
    }, 'Five fault points roll back Seed removals, portable rows and pointer together.');
    await test('RESTORE-015', async () => await payloadHash(snapshotPayload(restored.profileId, restored.data)) === document.integrity.payloadHash, 'Entire portable canonical hash matches original.');
    await test('RESTORE-016', async () => {
      target.database.close(); await target.database.open(); await target.bootstrapService.initialize();
      const after = await target.backupSnapshotReader.readCurrentProfile();
      return await payloadHash(snapshotPayload(after.profileId, after.data)) === document.integrity.payloadHash;
    }, 'Reopen and bootstrap preserve all restored values without Seed mutation.');
    await test('RESTORE-STALE-PREVIEW', async () => {
      const c = await make('stale'); const p = await c.backupImportService.inspectFile(file(document));
      await c.repositories.userSettings.create({ key: 'changed-after-preview', value: true });
      const before = await c.backupSnapshotReader.readCurrentProfile();
      return await rejects(() => c.backupImportService.restorePreview(p.id), 'RESTORE_TARGET_NOT_PRISTINE') && equal(before, await c.backupSnapshotReader.readCurrentProfile());
    });
    await test('RESTORE-CHANGED-SEED', async () => {
      const c = await make('changed-seed'); const seed = (await c.repositories.exerciseType.list())[0];
      await c.exerciseManagementService.updateExerciseType(seed.id, { name: '필라테스 수정' }, seed.revision);
      return !(await c.backupImportService.inspectFile(file(document))).pristine;
    });
    await test('RESTORE-CONCURRENT', async () => {
      const c = await make('concurrent');
      const second = createContainer({ dbName: c.database.name }); containers.push(second);
      await second.database.open(); await second.bootstrapService.initialize();
      const [a, b] = await Promise.all([c.backupImportService.inspectFile(file(document)), second.backupImportService.inspectFile(file(document))]);
      const results = await Promise.allSettled([c.backupImportService.restorePreview(a.id), second.backupImportService.restorePreview(b.id)]);
      return results.filter((r) => r.status === 'fulfilled').length === 1 && results.some((r) => r.status === 'rejected' && r.reason.code === 'RESTORE_TARGET_NOT_PRISTINE');
    }, 'Two connections cannot mix or duplicate concurrent restores.');
    await test('BACKUP-SNAPSHOT-ATOMIC', async () => {
      const c = await make('snapshot');
      const [snapshot] = await Promise.all([c.backupExportService.exportCurrentProfile(), c.exerciseManagementService.createExerciseType({ name: '동시 생성', fields: [] })]);
      const d = snapshot.document.data;
      return d.exercise_types.length === d.exercise_templates.length && [1, 2].includes(d.exercise_types.length);
    }, 'Snapshot observes both type/template writes together or neither.');
  } finally {
    const names = [...new Set(containers.map((c) => c.database.name))];
    containers.forEach((c) => c.database.close());
    for (const name of names) {
      if (!name.startsWith('personal-health-pwa-test-backup-')) throw Error('Unsafe test database cleanup');
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(Error('Test cleanup blocked'));
      });
    }
  }
}

import { runHealthTests } from './health-test.js';
import { runQaFeedbackTests } from './qa-feedback-test.js';
import { runActivityTests } from './activity-test.js';
import { createContainer } from '../../js/bootstrap/container.js';
import { runBackupBrowserTests } from './backup-test.js';
import { ConflictError } from '../../js/core/errors.js';
import { isUuid } from '../../js/core/id-generator.js';
import { requestToPromise } from '../../js/data/indexeddb/idb-request.js';
import {
  EXPECTED_STORE_COUNT,
  STORE_DEFINITIONS,
  STORE_NAMES
} from '../../js/data/indexeddb/schema.js';

const TEST_DB_NAME = 'personal-health-pwa-test-v0.6.0';
const ROLLBACK_DB_NAME = 'personal-health-pwa-test-v0.6.0-rollback';
const EXERCISE_ROLLBACK_DB_NAME = 'personal-health-pwa-test-v0.6.0-exercise-rollback';
const resultNode = document.querySelector('#test-result');
const cases = [];

class StepClock {
  constructor() {
    this.current = Date.parse('2026-09-04T12:00:00.000Z');
  }

  nowIso() {
    const value = new Date(this.current).toISOString();
    this.current += 1000;
    return value;
  }
}

function record(id, pass, evidence) {
  document.body.dataset.lastCase = id;
  cases.push({ id, status: pass ? 'PASS' : 'FAIL', evidence });
}

async function test(id, callback, evidence = '') {
  try {
    const value = await callback();
    const pass = value === undefined ? true : Boolean(value);
    record(id, pass, evidence || (pass ? 'Completed without error.' : 'Returned false.'));
  } catch (error) {
    record(id, false, `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`);
  }
}

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.addEventListener('success', () => resolve(), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
    request.addEventListener('blocked', () => reject(new Error(`Delete blocked: ${name}`)), { once: true });
  });
}

async function expectReject(callback, predicate = null) {
  try {
    await callback();
    return false;
  } catch (error) {
    return typeof predicate === 'function' ? predicate(error) : true;
  }
}

async function rawCount(database, storeName) {
  return database.runTransaction([storeName], 'readonly', async ({ store }) => {
    return requestToPromise(store(storeName).count());
  });
}

async function run() {
  await deleteDatabase(TEST_DB_NAME);
  await deleteDatabase(ROLLBACK_DB_NAME);
  await deleteDatabase(EXERCISE_ROLLBACK_DB_NAME);

  const clock = new StepClock();
  let container = createContainer({ dbName: TEST_DB_NAME, clock });
  await container.database.open();
  await container.logger.attachRepository(container.repositories.appLog);
  const firstBootstrap = await container.bootstrapService.initialize();
  const profileAId = firstBootstrap.profileId;

  await test('DB-001', async () => (await container.database.inspectSchema()).version === 1, 'DB version is 1.');
  await test('DB-002', async () => (await container.database.inspectSchema()).storeNames.length === EXPECTED_STORE_COUNT, '14 Object Stores exist.');
  await test('DB-003', async () => {
    const actual = await container.database.inspectSchema();
    return Object.entries(STORE_DEFINITIONS).every(([storeName, definition]) => {
      const actualStore = actual.stores[storeName];
      if (!actualStore || JSON.stringify(actualStore.keyPath) !== JSON.stringify(definition.keyPath)) return false;

      return definition.indexes.every((expectedIndex) => {
        const actualIndex = actualStore.indexDefinitions.find((item) => item.name === expectedIndex.name);
        return Boolean(actualIndex)
          && JSON.stringify(actualIndex.keyPath) === JSON.stringify(expectedIndex.keyPath)
          && actualIndex.unique === Boolean(expectedIndex.options.unique)
          && actualIndex.multiEntry === Boolean(expectedIndex.options.multiEntry);
      });
    });
  }, 'All real Object Store key paths and Index definitions match the approved schema.');
  await test('DB-005', () => container.database.name === TEST_DB_NAME, 'Test database is separate from the production database.');

  const profilesAfterFirst = await container.repositories.profile.list();
  await test('PROFILE-001', () => profilesAfterFirst.length === 1, 'One local Profile was created.');
  await test('PROFILE-002-ID', () => isUuid(profileAId), 'Profile ID is UUID v4.');
  await test('PROFILE-003', async () => {
    const pointer = await container.repositories.deviceSettings.get('current_profile_id');
    return pointer?.value === profileAId && container.identityContext.getCurrentProfileId() === profileAId;
  }, 'Current profile pointer and IdentityContext are aligned.');

  const initialTypes = await container.repositories.exerciseType.list({ includeDeleted: true });
  const initialTemplates = await container.repositories.exerciseTemplate.list({ includeDeleted: true });
  const pilates = initialTypes.find((item) => item.system_key === 'default.pilates');
  const pilatesTemplate = initialTemplates.find((item) => item.exercise_type_id === pilates?.id && item.version === 1);
  await test('SEED-001', () => initialTypes.filter((item) => item.system_key === 'default.pilates').length === 1, 'One default Pilates type exists.');
  await test('SEED-002', () => Boolean(pilatesTemplate) && pilatesTemplate.fields?.[0]?.key === 'duration_minutes', 'Pilates template v1 exists.');
  await test('UUID-001', () => isUuid(pilates.id) && isUuid(pilatesTemplate.id), 'Seed entities use UUID v4.');
  await test('TIME-001', () => /Z$/.test(pilates.created_at) && !Number.isNaN(Date.parse(pilates.created_at)), 'Entity timestamps use UTC ISO format.');

  await container.bootstrapService.initialize();
  await test('PROFILE-002', async () => (await container.repositories.profile.list()).length === 1, 'Repeated bootstrap does not duplicate profiles.');
  await test('SEED-003', async () => {
    const types = await container.repositories.exerciseType.list({ includeDeleted: true });
    const templates = await container.repositories.exerciseTemplate.list({ includeDeleted: true });
    return types.filter((item) => item.system_key === 'default.pilates').length === 1
      && templates.filter((item) => item.exercise_type_id === pilates.id && item.version === 1).length === 1;
  }, 'Repeated bootstrap does not duplicate seed records.');

  const renamedPilates = await container.repositories.exerciseType.update(pilates.id, { name: '내 필라테스' }, pilates.revision);
  let profileA = await container.repositories.profile.getById(profileAId);
  profileA = await container.repositories.profile.update(profileAId, { seed_version: 0 }, profileA.revision);
  await container.bootstrapService.initialize();
  await test('SEED-004', async () => (await container.repositories.exerciseType.getById(pilates.id))?.name === '내 필라테스', 'Seed upgrade does not overwrite a user rename.');

  const currentPilates = await container.repositories.exerciseType.getById(pilates.id);
  const deletedPilates = await container.repositories.exerciseType.softDelete(pilates.id, currentPilates.revision);
  profileA = await container.repositories.profile.getById(profileAId);
  await container.repositories.profile.update(profileAId, { seed_version: 0 }, profileA.revision);
  await container.bootstrapService.initialize();
  await test('SEED-005', async () => (await container.repositories.exerciseType.getById(pilates.id)) === null, 'Soft-deleted seed is not restored automatically.');
  await container.repositories.exerciseType.restore(pilates.id, deletedPilates.revision);

  const created = await container.repositories.exerciseType.create({
    name: '러닝',
    icon: 'R',
    status: 'active',
    sort_order: 2,
    profile_id: 'untrusted-profile-id'
  });
  await test('SCOPE-CREATE-001', () => created.profile_id === profileAId, 'Repository ignores an untrusted input profile_id.');
  await test('REV-001', () => created.revision === 1, 'New entity revision is 1.');

  const createdAt = created.created_at;
  const updated = await container.repositories.exerciseType.update(created.id, { name: '달리기' }, created.revision);
  await test('REV-002', () => updated.revision === 2 && updated.created_at === createdAt && updated.updated_at !== createdAt, 'Update increments revision and preserves created_at.');
  await test('REV-003', () => expectReject(
    () => container.repositories.exerciseType.update(created.id, { name: '오래된 수정' }, 1),
    (error) => error instanceof ConflictError || error?.code === 'REVISION_CONFLICT'
  ), 'Stale expectedRevision is rejected.');
  await test('PROTECTED-001', () => expectReject(
    () => container.repositories.exerciseType.update(created.id, { profile_id: crypto.randomUUID() }, updated.revision),
    (error) => error?.code === 'PATCH_PROTECTED_FIELD'
  ), 'A caller cannot move an entity to another Profile through an update patch.');
  await test('REV-004', () => expectReject(
    () => container.repositories.exerciseType.softDelete(created.id, 1),
    (error) => error instanceof ConflictError || error?.code === 'REVISION_CONFLICT'
  ), 'Soft-delete rejects a stale expectedRevision.');

  const deleted = await container.repositories.exerciseType.softDelete(created.id, updated.revision);
  await test('DELETE-001', async () => (await container.repositories.exerciseType.getById(created.id)) === null, 'Soft-deleted record is excluded from normal get.');
  await test('DELETE-002', async () => (await container.repositories.exerciseType.getByIdIncludingDeleted(created.id))?.deleted_at !== null, 'Deleted record remains queryable through explicit include-deleted path.');
  await test('REV-005', () => expectReject(
    () => container.repositories.exerciseType.restore(created.id, updated.revision),
    (error) => error instanceof ConflictError || error?.code === 'REVISION_CONFLICT'
  ), 'Restore rejects a stale expectedRevision.');
  const restored = await container.repositories.exerciseType.restore(created.id, deleted.revision);
  await test('DELETE-003', () => restored.id === created.id && restored.deleted_at === null && restored.revision === 4, 'Restore keeps ID and increments revision.');

  await test('UNIQUE-OPTIONAL-001', async () => {
    const secondCustomExercise = await container.repositories.exerciseType.create({
      name: '걷기',
      icon: 'W',
      status: 'active',
      sort_order: 3
    });
    return Boolean(secondCustomExercise.id) && !Object.hasOwn(secondCustomExercise, 'system_key');
  }, 'Multiple user-created exercises without system_key are allowed.');

  await test('UNIQUE-OPTIONAL-002', async () => {
    const firstSchedule = await container.repositories.exerciseSchedule.create({
      exercise_type_id: pilates.id,
      scheduled_at: '2026-09-05T10:00:00.000Z',
      expected_duration_minutes: 50,
      memo: '',
      status: 'scheduled'
    });
    const secondSchedule = await container.repositories.exerciseSchedule.create({
      exercise_type_id: pilates.id,
      scheduled_at: '2026-09-06T10:00:00.000Z',
      expected_duration_minutes: 50,
      memo: '',
      status: 'scheduled'
    });
    return !Object.hasOwn(firstSchedule, 'completed_exercise_log_id')
      && !Object.hasOwn(secondSchedule, 'completed_exercise_log_id');
  }, 'Multiple schedules without completed_exercise_log_id are allowed.');

  await test('UNIQUE-OPTIONAL-003', async () => {
    const firstWeight = await container.repositories.weight.create({
      measured_at: '2026-09-05T00:00:00.000Z',
      weight: 65.8,
      memo: '',
      source: 'manual'
    });
    const secondWeight = await container.repositories.weight.create({
      measured_at: '2026-09-05T12:00:00.000Z',
      weight: 66.1,
      memo: '',
      source: 'manual'
    });
    return !Object.hasOwn(firstWeight, 'source_ref_id')
      && !Object.hasOwn(secondWeight, 'source_ref_id');
  }, 'Multiple manual weights without source_ref_id are allowed.');

  const profileB = await container.repositories.profile.create({
    display_name: '테스트 프로필 B',
    timezone: 'Asia/Seoul',
    seed_version: 1
  });
  container.identityContext.setCurrentProfileId(profileB.id);
  const profileBRecord = await container.repositories.exerciseType.create({
    name: 'B 전용 운동',
    status: 'active',
    sort_order: 1
  });
  container.identityContext.setCurrentProfileId(profileAId);
  await test('SCOPE-001', async () => (await container.repositories.exerciseType.getById(profileBRecord.id)) === null, 'Profile A cannot read Profile B data.');
  await test('SCOPE-002', () => expectReject(
    () => container.repositories.exerciseType.update(profileBRecord.id, { name: '침범' }, profileBRecord.revision),
    (error) => error?.code === 'ENTITY_NOT_FOUND'
  ), 'Profile A cannot update Profile B data.');

  await test('UNIQUE-001', () => expectReject(() => container.repositories.exerciseType.create({
    system_key: 'default.pilates',
    name: '중복 필라테스',
    status: 'active',
    sort_order: 99
  })), 'Duplicate profile/system_key is rejected by a unique compound index.');

  await test('UNIQUE-002', () => expectReject(() => container.repositories.exerciseTemplate.create({
    exercise_type_id: pilates.id,
    version: 1,
    status: 'active',
    fields: []
  })), 'Duplicate profile/exercise/version is rejected.');

  const pass = await container.repositories.pass.create({
    exercise_type_id: pilates.id,
    name: '테스트 60회권',
    total_count: 60,
    start_date: '2026-09-04',
    expiry_date: '2027-09-03',
    memo: '',
    status: 'active'
  });
  const exerciseLog = await container.repositories.exerciseLog.create({
    exercise_type_id: pilates.id,
    template_id: pilatesTemplate.id,
    performed_at: '2026-09-04T13:00:00.000Z',
    values: { duration_minutes: 50 },
    memo: ''
  });
  await container.repositories.passUsage.create({
    pass_id: pass.id,
    exercise_log_id: exerciseLog.id,
    used_count: 1,
    status: 'used',
    memo: ''
  });
  await test('UNIQUE-003', () => expectReject(() => container.repositories.passUsage.create({
    pass_id: pass.id,
    exercise_log_id: exerciseLog.id,
    used_count: 1,
    status: 'used',
    memo: ''
  })), 'Duplicate pass/exercise usage is rejected.');

  const abortedDietId = crypto.randomUUID();
  const abortedWeightId = crypto.randomUUID();
  await expectReject(() => container.database.runTransaction(
    [STORE_NAMES.DIET_LOGS, STORE_NAMES.WEIGHT_LOGS],
    'readwrite',
    async ({ store }) => {
      const now = clock.nowIso();
      await requestToPromise(store(STORE_NAMES.DIET_LOGS).add({
        id: abortedDietId,
        profile_id: profileAId,
        eaten_at: now,
        meal_type: 'other',
        content: '',
        memo: '',
        created_at: now,
        updated_at: now,
        deleted_at: null,
        revision: 1
      }));
      await requestToPromise(store(STORE_NAMES.WEIGHT_LOGS).add({
        id: abortedWeightId,
        profile_id: profileAId,
        measured_at: now,
        weight: 60,
        memo: '',
        source: 'manual',
        created_at: now,
        updated_at: now,
        deleted_at: null,
        revision: 1
      }));
      throw new Error('Intentional abort');
    }
  ));
  await test('TX-002', async () => container.database.runTransaction(
    [STORE_NAMES.DIET_LOGS, STORE_NAMES.WEIGHT_LOGS],
    'readonly',
    async ({ store }) => {
      const diet = await requestToPromise(store(STORE_NAMES.DIET_LOGS).get(abortedDietId));
      const weight = await requestToPromise(store(STORE_NAMES.WEIGHT_LOGS).get(abortedWeightId));
      return !diet && !weight;
    }
  ), 'Explicit abort leaves no partial records.');

  const rollbackContainer = createContainer({
    dbName: ROLLBACK_DB_NAME,
    clock: new StepClock(),
    faultInjector(step) {
      if (step === 'after-profile') throw new Error('Injected bootstrap failure');
    }
  });
  await rollbackContainer.database.open();
  await expectReject(() => rollbackContainer.bootstrapService.initialize());
  await test('TX-001', async () => {
    const counts = await Promise.all([
      rawCount(rollbackContainer.database, STORE_NAMES.PROFILES),
      rawCount(rollbackContainer.database, STORE_NAMES.EXERCISE_TYPES),
      rawCount(rollbackContainer.database, STORE_NAMES.EXERCISE_TEMPLATES),
      rawCount(rollbackContainer.database, STORE_NAMES.DEVICE_SETTINGS)
    ]);
    return counts.every((count) => count === 0);
  }, 'Bootstrap failure rolls back Profile, seed, and device pointer together.');
  rollbackContainer.database.close();

  await container.repositories.deviceSettings.set('current_profile_id', crypto.randomUUID());
  container.database.close();
  container = createContainer({ dbName: TEST_DB_NAME, clock });
  await container.database.open();
  await container.logger.attachRepository(container.repositories.appLog);
  const recovery = await container.bootstrapService.initialize();
  await test('PROFILE-004', async () => {
    const pointer = await container.repositories.deviceSettings.get('current_profile_id');
    return recovery.profilePointerRepaired
      && pointer?.value === profileAId
      && (await container.repositories.profile.list()).length === 2;
  }, 'Invalid profile pointer is repaired without creating another Profile.');

  const persisted = await container.repositories.exerciseType.getById(created.id);
  await test('DB-004', () => persisted?.name === '달리기' && persisted.revision === 4, 'Record survives database close and reopen.');

  // v0.6.0 Exercise Core
  const currentTypesBeforeExercise = await container.exerciseQueryService.listActiveTypes();
  await test('EX-TYPE-001', () => currentTypesBeforeExercise.some((item) => item.system_key === 'default.pilates'), 'Default Pilates seed is visible through the exercise query service.');

  const runningBundle = await container.exerciseManagementService.createExerciseType({
    name: '러닝',
    icon: '🏃',
    fields: [
      { key: 'duration_minutes' },
      { key: 'distance_km' },
      { label: '라운드 수', type: 'number', unit: 'round', required: false }
    ]
  });
  const running = runningBundle.exerciseType;
  const runningV1 = runningBundle.template;
  const customFieldV1 = runningV1.fields.find((field) => field.key.startsWith('custom_'));
  await test('EX-TYPE-002', () => running.name === '러닝' && running.revision === 1, 'A user-created exercise type is created through the application service.');
  await test('EX-TPL-001', () => runningV1.version === 1 && runningV1.status === 'active' && runningV1.exercise_type_id === running.id, 'Exercise creation atomically creates template v1.');
  await test('EX-TPL-007', () => Boolean(customFieldV1?.key) && customFieldV1.key.startsWith('custom_'), 'Custom fields receive a stable UUID-based key.');

  const logV1 = await container.exerciseLogService.create({
    exercise_type_id: running.id,
    performed_at_local: '2026-09-05T08:00',
    values: {
      duration_minutes: '30',
      distance_km: '3.2',
      [customFieldV1.key]: '2'
    },
    memo: 'v1 기록'
  });
  await test('EX-LOG-001', () => logV1.exercise_type_id === running.id && logV1.template_id === runningV1.id, 'Exercise log is created against the current active template.');
  await test('EX-LOG-002', () => logV1.memo === 'v1 기록', 'Exercise memo is stored as a common fixed field.');
  await test('EX-LOG-003', () => logV1.values.distance_km === 3.2 && logV1.values[customFieldV1.key] === 2, 'Dynamic exercise values are validated and normalized.');

  const v2Fields = runningV1.fields.map((field) => (
    field.key === customFieldV1.key ? { ...field, label: '스파링 라운드' } : field
  ));
  v2Fields.push({ key: 'pace' });
  const versionResult = await container.exerciseManagementService.createTemplateVersion(
    running.id,
    v2Fields,
    { expectedTemplateId: runningV1.id, expectedTemplateRevision: runningV1.revision }
  );
  const runningV2 = versionResult.template;
  const runningV1After = await container.repositories.exerciseTemplate.getById(runningV1.id);
  await test('EX-TPL-003', () => runningV2.version === 2 && runningV2.status === 'active', 'Template edit creates a new active version.');
  await test('EX-TPL-004', () => runningV1After.status === 'superseded' && runningV1After.revision === 2, 'Previous template is retained as superseded.');
  await test('EX-TPL-007-KEY', () => runningV2.fields.find((field) => field.label === '스파링 라운드')?.key === customFieldV1.key, 'Changing a custom field label preserves its internal key.');
  await test('EX-TPL-009', () => expectReject(
    () => container.exerciseManagementService.createTemplateVersion(running.id, v2Fields, { expectedTemplateId: runningV1.id, expectedTemplateRevision: runningV1.revision }),
    (error) => error?.code === 'REVISION_CONFLICT'
  ), 'Stale template ID/revision pair is rejected.');

  const oldDetail = await container.exerciseLogService.getDetail(logV1.id);
  await test('EX-TPL-005', () => oldDetail.template.id === runningV1.id && oldDetail.template.version === 1, 'Existing record keeps its original template after a newer template is created.');
  const updatedOldLog = await container.exerciseLogService.update(logV1.id, {
    performed_at_local: '2026-09-05T08:10',
    values: {
      duration_minutes: '35',
      distance_km: '3.5',
      [customFieldV1.key]: '3'
    },
    memo: 'v1 수정 기록'
  }, logV1.revision);
  await test('EX-LOG-014', () => updatedOldLog.template_id === runningV1.id && updatedOldLog.values.distance_km === 3.5, 'Historical record can still be edited with its historical template.');
  await test('EX-LOG-006', () => updatedOldLog.created_at === logV1.created_at, 'Exercise log update preserves created_at.');
  await test('EX-LOG-007', () => updatedOldLog.updated_at !== logV1.updated_at && updatedOldLog.revision === 2, 'Exercise log update changes updated_at and revision.');
  await test('EX-LOG-009', () => expectReject(
    () => container.exerciseLogService.update(logV1.id, {
      performed_at_local: '2026-09-05T08:20', values: updatedOldLog.values, memo: ''
    }, logV1.revision),
    (error) => error?.code === 'REVISION_CONFLICT'
  ), 'Stale exercise log revision is rejected.');

  const logV2 = await container.exerciseLogService.create({
    exercise_type_id: running.id,
    performed_at_local: '2026-09-06T09:00',
    values: {
      duration_minutes: 40,
      distance_km: 5,
      [customFieldV1.key]: 4,
      pace: '6:10'
    },
    memo: 'v2 기록'
  });
  await test('EX-TPL-006', () => logV2.template_id === runningV2.id && logV2.values.pace === '6:10', 'New record uses the latest active template.');
  await test('EX-VAL-004', () => expectReject(
    () => container.exerciseLogService.create({
      exercise_type_id: running.id,
      performed_at_local: '2026-09-06T10:00',
      values: { duration_minutes: 'not-a-number' },
      memo: ''
    }),
    (error) => error?.code === 'EXERCISE_VALUE_NUMBER_INVALID'
  ), 'Invalid numeric dynamic value is rejected by the application service.');
  await test('EX-VAL-008', () => expectReject(
    () => container.exerciseManagementService.createExerciseType({ name: '   ', fields: [] }),
    (error) => error?.code === 'EXERCISE_NAME_REQUIRED'
  ), 'Blank exercise name is rejected.');

  const runningBeforeInactive = await container.repositories.exerciseType.getById(running.id);
  const inactiveRunning = await container.exerciseManagementService.setExerciseTypeStatus(running.id, 'inactive', runningBeforeInactive.revision);
  await test('EX-TYPE-005', () => inactiveRunning.status === 'inactive', 'Exercise type can be deactivated.');
  await test('EX-VAL-003', () => expectReject(
    () => container.exerciseLogService.create({ exercise_type_id: running.id, performed_at_local: '2026-09-06T11:00', values: {}, memo: '' }),
    (error) => error?.code === 'EXERCISE_TYPE_INACTIVE'
  ), 'Inactive exercise cannot receive a new log.');
  const reactivatedRunning = await container.exerciseManagementService.setExerciseTypeStatus(running.id, 'active', inactiveRunning.revision);
  await test('EX-TYPE-006', () => reactivatedRunning.status === 'active', 'Exercise type can be reactivated.');

  const deletedRunning = await container.exerciseManagementService.softDeleteExerciseType(running.id, reactivatedRunning.revision);
  await test('EX-TYPE-007', () => deletedRunning.deleted_at !== null, 'Exercise type uses soft-delete.');
  await test('EX-TYPE-008', async () => !(await container.exerciseQueryService.listActiveTypes()).some((item) => item.id === running.id), 'Soft-deleted exercise is excluded from active list.');
  await test('EX-VAL-002', () => expectReject(
    () => container.exerciseLogService.create({ exercise_type_id: running.id, performed_at_local: '2026-09-06T12:00', values: {}, memo: '' }),
    (error) => error?.code === 'EXERCISE_TYPE_NOT_FOUND'
  ), 'Deleted exercise cannot receive a new log.');
  const restoredRunning = await container.exerciseManagementService.restoreExerciseType(running.id, deletedRunning.revision);
  await test('EX-TYPE-RESTORE-001', () => restoredRunning.deleted_at === null && restoredRunning.id === running.id, 'Soft-deleted exercise can be restored without changing ID.');

  const deletedLog = await container.exerciseLogService.softDelete(logV2.id, logV2.revision);
  await test('EX-LOG-010', () => deletedLog.deleted_at !== null, 'Exercise log uses soft-delete.');
  await test('EX-LOG-011', () => expectReject(
    () => container.exerciseLogService.getDetail(logV2.id),
    (error) => error?.code === 'EXERCISE_LOG_NOT_FOUND'
  ), 'Deleted exercise log is excluded from normal detail lookup.');
  await test('EX-LOG-012', async () => (await container.exerciseLogService.getDetail(logV2.id, { includeDeleted: true })).log.deleted_at !== null, 'Deleted exercise log is available through explicit include-deleted lookup.');
  const restoredLog = await container.exerciseLogService.restore(logV2.id, deletedLog.revision);
  await test('EX-LOG-RESTORE-001', () => restoredLog.deleted_at === null && restoredLog.id === logV2.id, 'Deleted exercise log restores with the same ID.');

  container.identityContext.setCurrentProfileId(profileB.id);
  await test('EX-TYPE-009', async () => !(await container.exerciseQueryService.listAllTypes({ includeDeleted: true })).some((item) => item.id === running.id), 'Exercise query service keeps Profile data isolated.');
  await test('EX-LOG-013', () => expectReject(
    () => container.exerciseLogService.getDetail(logV1.id),
    (error) => error?.code === 'EXERCISE_LOG_NOT_FOUND'
  ), 'Exercise log service cannot read another Profile log.');
  container.identityContext.setCurrentProfileId(profileAId);

  const exerciseRollbackContainer = createContainer({
    dbName: EXERCISE_ROLLBACK_DB_NAME,
    clock: new StepClock(),
    faultInjector(step) {
      if (step === 'after-exercise-type') throw new Error('Injected exercise creation failure');
    }
  });
  await exerciseRollbackContainer.database.open();
  await exerciseRollbackContainer.logger.attachRepository(exerciseRollbackContainer.repositories.appLog);
  await exerciseRollbackContainer.bootstrapService.initialize();
  await expectReject(() => exerciseRollbackContainer.exerciseManagementService.createExerciseType({
    name: '롤백 운동', icon: 'X', fields: [{ key: 'duration_minutes' }]
  }));
  await test('EX-TPL-002', async () => {
    const types = await exerciseRollbackContainer.repositories.exerciseType.list({ includeDeleted: true });
    const templates = await exerciseRollbackContainer.repositories.exerciseTemplate.list({ includeDeleted: true });
    return types.length === 1 && templates.length === 1 && types[0].system_key === 'default.pilates';
  }, 'Exercise type + template creation rolls back together on mid-command failure.');
  exerciseRollbackContainer.database.close();

  for (let index = 0; index < 205; index += 1) {
    await container.repositories.appLog.append({
      level: 'INFO',
      event: `LIMIT_TEST_${String(index).padStart(3, '0')}`,
      message: 'Log retention test',
      context: null
    });
  }
  await test('LOG-001', async () => (await container.repositories.appLog.listRecent(1))[0]?.event === 'LIMIT_TEST_204', 'App log records can be written and read.');
  await test('LOG-002', async () => (await container.repositories.appLog.count()) === 200, 'App log retention is capped at 200 records.');

  const diagnostic = await container.databaseDiagnosticService.diagnose();
  await test('DIAG-001', () => diagnostic.status === 'normal' && diagnostic.actualStoreCount === 14, 'Read-only diagnostic reports a healthy database.');

  container.database.close();
  await deleteDatabase(TEST_DB_NAME);
  await deleteDatabase(ROLLBACK_DB_NAME);
  await deleteDatabase(EXERCISE_ROLLBACK_DB_NAME);
}

try {
  await run();
  await runBackupBrowserTests(test);
  await runActivityTests(test);
  await runQaFeedbackTests(test);
  await runHealthTests(test);
} catch (error) {
  record('BROWSER-HARNESS', false, `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`);
}

const passed = cases.filter((item) => item.status === 'PASS').length;
const failed = cases.filter((item) => item.status === 'FAIL').length;
const result = {
  version: '0.6.0',
  suite: 'browser-indexeddb',
  executedAt: new Date().toISOString(),
  userAgent: navigator.userAgent,
  summary: { total: cases.length, passed, failed, notRun: 0 },
  cases
};

resultNode.textContent = JSON.stringify(result);
document.body.dataset.status = 'done';
document.body.dataset.failed = String(failed);

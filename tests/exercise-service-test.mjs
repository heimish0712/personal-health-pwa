import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { TestReporter } from './test-reporter.mjs';

const root = path.resolve(process.cwd());
const output = path.join(root, 'tests/results/v0.10.0-exercise-service.json');
const reporter = new TestReporter('exercise-service');
await import(pathToFileURL(path.join(root, 'js/config.js')));
const { ExerciseManagementService } = await import(pathToFileURL(path.join(root, 'js/application/exercise-management.service.js')));
const { ExerciseLogService } = await import(pathToFileURL(path.join(root, 'js/application/exercise-log.service.js')));
const { ExerciseQueryService } = await import(pathToFileURL(path.join(root, 'js/application/exercise-query.service.js')));
const { localDateTimeToUtcIso } = await import(pathToFileURL(path.join(root, 'js/core/datetime.js')));
const { ConflictError, NotFoundError } = await import(pathToFileURL(path.join(root, 'js/core/errors.js')));

class IdGenerator { constructor() { this.i = 0; } generate() { this.i += 1; return `00000000-0000-4000-8000-${String(this.i).padStart(12, '0')}`; } }
class Clock { constructor() { this.t = Date.parse('2026-09-05T00:00:00.000Z'); } nowIso() { const v = new Date(this.t).toISOString(); this.t += 1000; return v; } }
class Identity { constructor() { this.id = 'profile-a'; } getCurrentProfileId() { return this.id; } }

class MemoryRepo {
  constructor({ clock, idGenerator, identity, scoped = true }) { this.rows = new Map(); this.clock = clock; this.ids = idGenerator; this.identity = identity; this.scoped = scoped; }
  visible(row, includeDeleted = false) { return row && (!this.scoped || row.profile_id === this.identity.getCurrentProfileId()) && (includeDeleted || row.deleted_at === null); }
  async getById(id) { const r = this.rows.get(id); return this.visible(r) ? structuredClone(r) : null; }
  async getByIdIncludingDeleted(id) { const r = this.rows.get(id); return this.visible(r, true) ? structuredClone(r) : null; }
  async list({ includeDeleted = false, predicate = null, sort = null } = {}) { let arr = [...this.rows.values()].filter((r) => this.visible(r, includeDeleted) && (!predicate || predicate(r))).map((item) => structuredClone(item)); if (sort) arr.sort(sort); return arr; }
  async create(data) { const now = this.clock.nowIso(); const id = this.ids.generate(); const row = { ...structuredClone(data), id, created_at: now, updated_at: now, deleted_at: null, revision: 1 }; if (this.scoped) row.profile_id = this.identity.getCurrentProfileId(); this.rows.set(id, row); return structuredClone(row); }
  async update(id, patch, expectedRevision) { const r = this.rows.get(id); if (!this.visible(r)) throw new NotFoundError('ENTITY_NOT_FOUND', 'not found'); if (r.revision !== expectedRevision) throw new ConflictError('REVISION_CONFLICT', 'conflict'); const next = { ...r, ...structuredClone(patch), updated_at: this.clock.nowIso(), revision: r.revision + 1 }; this.rows.set(id, next); return structuredClone(next); }
  async softDelete(id, expectedRevision) { const r = this.rows.get(id); if (!this.visible(r)) throw new NotFoundError('ENTITY_NOT_FOUND', 'not found'); if (r.revision !== expectedRevision) throw new ConflictError('REVISION_CONFLICT', 'conflict'); const now = this.clock.nowIso(); const next = { ...r, deleted_at: now, updated_at: now, revision: r.revision + 1 }; this.rows.set(id, next); return structuredClone(next); }
  async restore(id, expectedRevision) { const r = this.rows.get(id); if (!this.visible(r, true)) throw new NotFoundError('ENTITY_NOT_FOUND', 'not found'); if (r.revision !== expectedRevision) throw new ConflictError('REVISION_CONFLICT', 'conflict'); const next = { ...r, deleted_at: null, updated_at: this.clock.nowIso(), revision: r.revision + 1 }; this.rows.set(id, next); return structuredClone(next); }
}

function makeFixture() {
  const clock = new Clock(); const ids = new IdGenerator(); const identity = new Identity();
  const typeRepo = new MemoryRepo({ clock, idGenerator: ids, identity });
  const templateRepo = new MemoryRepo({ clock, idGenerator: ids, identity });
  const logRepo = new MemoryRepo({ clock, idGenerator: ids, identity });
  const profileRepo = { async getById() { return { id: 'profile-a', timezone: 'Asia/Seoul', deleted_at: null }; } };
  const command = {
    async createExerciseTypeWithTemplate({ exerciseType, fields }) {
      const type = await typeRepo.create(exerciseType);
      const template = await templateRepo.create({ exercise_type_id: type.id, version: 1, status: 'active', fields });
      return { exerciseType: type, template };
    },
    async createNewTemplateVersion({ exerciseTypeId, expectedTemplateId, expectedTemplateRevision, fields }) {
      const active = (await templateRepo.list({ predicate: (x) => x.exercise_type_id === exerciseTypeId && x.status === 'active' }))[0];
      if (!active || active.id !== expectedTemplateId || active.revision !== expectedTemplateRevision) throw new ConflictError('REVISION_CONFLICT', 'conflict');
      const all = await templateRepo.list({ predicate: (x) => x.exercise_type_id === exerciseTypeId });
      const previousTemplate = await templateRepo.update(active.id, { status: 'superseded' }, active.revision);
      const template = await templateRepo.create({ exercise_type_id: exerciseTypeId, version: Math.max(...all.map((x) => x.version)) + 1, status: 'active', fields });
      return { previousTemplate, template };
    }
  };
  const management = new ExerciseManagementService({ exerciseTypeRepository: typeRepo, exerciseTemplateRepository: templateRepo, exerciseManagementCommand: command, idGenerator: ids });
  const logs = new ExerciseLogService({ exerciseTypeRepository: typeRepo, exerciseTemplateRepository: templateRepo, exerciseLogRepository: logRepo, profileRepository: profileRepo, identityContext: identity, activityCommand: {
    saveLog: ({ id, data, expectedRevision }) => id ? logRepo.update(id, data, expectedRevision) : logRepo.create(data),
    deleteLog: ({ id, expectedRevision }) => logRepo.softDelete(id, expectedRevision),
    restoreLog: ({ id, expectedRevision }) => logRepo.restore(id, expectedRevision)
  } });
  const query = new ExerciseQueryService({ exerciseTypeRepository: typeRepo, exerciseTemplateRepository: templateRepo, exerciseLogRepository: logRepo, profileRepository: profileRepo, identityContext: identity, clock });
  return { clock, ids, identity, typeRepo, templateRepo, logRepo, management, logs, query };
}

async function rejects(fn, code) { try { await fn(); return false; } catch (e) { return e?.code === code; } }

const f = makeFixture();
const created = await f.management.createExerciseType({ name: '러닝', icon: '🏃', fields: [{ key: 'duration_minutes' }, { key: 'distance_km' }, { label: '라운드 수', type: 'number', unit: 'round' }] });
const custom = created.template.fields.find((x) => x.key.startsWith('custom_'));
reporter.check('UNIT-EX-001', created.exerciseType.name === '러닝' && created.template.version === 1, 'Exercise type and template v1 are created through contracts.');
reporter.check('UNIT-EX-002', Boolean(custom) && custom.key.startsWith('custom_'), 'Custom field receives stable generated key.');

const log1 = await f.logs.create({ exercise_type_id: created.exerciseType.id, performed_at_local: '2026-09-05T09:00', values: { duration_minutes: '30', distance_km: '4.5', [custom.key]: '2' }, memo: '첫 기록' });
reporter.check('UNIT-LOG-001', log1.template_id === created.template.id && log1.values.distance_km === 4.5 && log1.memo === '첫 기록', 'New log uses active template and normalizes numeric values.');
reporter.check('UNIT-TIME-001', localDateTimeToUtcIso('2026-09-05T09:00', 'Asia/Seoul') === '2026-09-05T00:00:00.000Z', 'Asia/Seoul datetime conversion is deterministic.');

const nextFields = created.template.fields.map((x) => x.key === custom.key ? { ...x, label: '스파링 라운드' } : x).concat([{ key: 'pace' }]);
const v2 = await f.management.createTemplateVersion(created.exerciseType.id, nextFields, { expectedTemplateId: created.template.id, expectedTemplateRevision: created.template.revision });
reporter.check('UNIT-TPL-001', v2.template.version === 2 && v2.previousTemplate.status === 'superseded', 'Template change creates v2 and supersedes v1.');
reporter.check('UNIT-TPL-002', v2.template.fields.find((x) => x.label === '스파링 라운드')?.key === custom.key, 'Custom field label change preserves key.');
reporter.check('UNIT-TPL-003', await rejects(() => f.management.createTemplateVersion(created.exerciseType.id, nextFields, { expectedTemplateId: created.template.id, expectedTemplateRevision: created.template.revision }), 'REVISION_CONFLICT'), 'Stale template ID/revision pair is rejected.');

const oldDetail = await f.logs.getDetail(log1.id);
reporter.check('UNIT-LOG-002', oldDetail.template.version === 1, 'Historical log keeps template v1.');
const oldUpdated = await f.logs.update(log1.id, { performed_at_local: '2026-09-05T09:10', values: { duration_minutes: 35, distance_km: 5, [custom.key]: 3 }, memo: '수정' }, log1.revision);
reporter.check('UNIT-LOG-003', oldUpdated.template_id === created.template.id && oldUpdated.revision === 2, 'Historical log update keeps original template ID and increments revision.');
reporter.check('UNIT-LOG-004', await rejects(() => f.logs.update(log1.id, { performed_at_local: '2026-09-05T09:20', values: {}, memo: '' }, log1.revision), 'REVISION_CONFLICT'), 'Stale log revision is rejected.');

const log2 = await f.logs.create({ exercise_type_id: created.exerciseType.id, performed_at_local: '2026-09-06T09:00', values: { duration_minutes: 40, distance_km: 6, [custom.key]: 4, pace: '6:20' }, memo: '' });
reporter.check('UNIT-LOG-005', log2.template_id === v2.template.id && log2.values.pace === '6:20', 'New log uses latest active template.');
reporter.check('UNIT-VAL-001', await rejects(() => f.logs.create({ exercise_type_id: created.exerciseType.id, performed_at_local: '2026-09-06T10:00', values: { duration_minutes: 'x' }, memo: '' }), 'EXERCISE_VALUE_NUMBER_INVALID'), 'Invalid number is rejected.');

const inactive = await f.management.setExerciseTypeStatus(created.exerciseType.id, 'inactive', created.exerciseType.revision);
reporter.check('UNIT-TYPE-001', inactive.status === 'inactive', 'Exercise type can be deactivated.');
reporter.check('UNIT-VAL-002', await rejects(() => f.logs.create({ exercise_type_id: created.exerciseType.id, performed_at_local: '2026-09-06T11:00', values: {}, memo: '' }), 'EXERCISE_TYPE_INACTIVE'), 'Inactive exercise rejects new logs.');
const activeAgain = await f.management.setExerciseTypeStatus(created.exerciseType.id, 'active', inactive.revision);
const deletedType = await f.management.softDeleteExerciseType(created.exerciseType.id, activeAgain.revision);
reporter.check('UNIT-TYPE-002', deletedType.deleted_at !== null, 'Exercise type soft-delete is used.');
const restoredType = await f.management.restoreExerciseType(created.exerciseType.id, deletedType.revision);
reporter.check('UNIT-TYPE-003', restoredType.deleted_at === null && restoredType.id === created.exerciseType.id, 'Exercise type restore keeps ID.');

const deletedLog = await f.logs.softDelete(log2.id, log2.revision);
reporter.check('UNIT-LOG-006', deletedLog.deleted_at !== null && await rejects(() => f.logs.getDetail(log2.id), 'EXERCISE_LOG_NOT_FOUND'), 'Deleted log is hidden from normal read.');
const restoredLog = await f.logs.restore(log2.id, deletedLog.revision);
reporter.check('UNIT-LOG-007', restoredLog.id === log2.id && restoredLog.deleted_at === null, 'Deleted log can be restored.');

const summary = await f.query.getWeeklySummary();
reporter.check('UNIT-QUERY-001', Number.isInteger(summary.count) && Number.isFinite(summary.durationMinutes), 'Weekly summary is calculated from source logs, not stored counters.');

reporter.finish(output);

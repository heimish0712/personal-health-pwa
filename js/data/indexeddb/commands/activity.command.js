import { ActivityCommandContract } from '../../contracts/activity-command.contract.js';
import { createScopedEntity } from '../../../core/entity-metadata.js';
import { ConflictError, NotFoundError } from '../../../core/errors.js';
import { requireRule, validatePass, dateKey } from '../../../core/pass-rules.js';
import { validateExerciseValues } from '../../../core/exercise-fields.js';
import { requestToPromise as request } from '../idb-request.js';

const STORES = ['profiles', 'exercise_types', 'exercise_templates', 'exercise_logs', 'passes', 'pass_usage_logs', 'exercise_schedules'];
const active = (row) => row.deleted_at === null && row.status === 'used';

export class IndexedDbActivityCommand extends ActivityCommandContract {
  constructor(dependencies) { super(); Object.assign(this, dependencies); }
  run(work) {
    const profileId = this.identityContext.getCurrentProfileId();
    return this.unitOfWork.run(STORES, 'readwrite', async ({ store }) => {
      const now = this.clock.nowIso();
      const get = async (name, id, deleted = false) => {
        const row = await request(store(name).get(id));
        if (!row || (name === 'profiles' ? row.id : row.profile_id) !== profileId || (!deleted && row.deleted_at !== null)) throw new NotFoundError('ENTITY_NOT_FOUND', '현재 프로필에서 데이터를 찾을 수 없습니다.');
        return row;
      };
      const put = async (name, row) => { await request(store(name).put(row)); return row; };
      const fresh = (data) => createScopedEntity({ data, id: this.idGenerator.generate(), profileId, nowIso: now });
      const patch = (row, data) => ({ ...row, ...data, updated_at: now, revision: row.revision + 1 });
      const index = (name, key, value) => request(store(name).index(key).getAll(value));
      return work({ get, put, fresh, patch, index, profileId, now });
    });
  }
  revision(row, expected) {
    if (!Number.isInteger(expected) || row.revision !== expected) throw new ConflictError('REVISION_CONFLICT', '다른 화면에서 변경되었습니다. 새로 열어 다시 시도하세요.');
  }
  checkpoint(name) {
    const result = typeof this.faultInjector === 'function' ? this.faultInjector(name) : this.faultInjector?.checkpoint?.(name);
    if (result?.then) throw new Error('Fault injection must be synchronous.');
  }
  async usages(tx, logId) { return tx.index('pass_usage_logs', 'by_profile_exercise_log', [tx.profileId, logId]); }
  async debit(tx, log, passId) {
    const rows = await this.usages(tx, log.id);
    requireRule(rows.filter(active).length <= 1, 'USAGE_CONFLICT', '운동기록에 중복 차감이 있습니다.');
    if (passId) {
      const pass = await tx.get('passes', passId);
      const profile = await tx.get('profiles', tx.profileId);
      const day = dateKey(log.performed_at, profile.timezone ?? 'Asia/Seoul');
      requireRule(pass.exercise_type_id === log.exercise_type_id, 'PASS_EXERCISE', '운동 종류와 이용권이 일치하지 않습니다.');
      // Existing debit can be kept when a pass is made inactive; new/re-activated debit cannot.
      const existing = rows.find((r) => r.pass_id === passId && active(r));
      requireRule(pass.status === 'active' || existing, 'PASS_INACTIVE', '비활성 이용권은 새로 차감할 수 없습니다.');
      requireRule(day >= pass.start_date && day <= pass.expiry_date, 'PASS_EXPIRED', '실제 운동일이 이용권 유효기간 밖입니다.');
      const all = await tx.index('pass_usage_logs', 'by_profile_pass_status', [tx.profileId, passId, 'used']);
      const used = all.filter((r) => active(r) && r.exercise_log_id !== log.id).reduce((n, r) => n + r.used_count, 0);
      requireRule(used + 1 <= pass.total_count, 'PASS_EXHAUSTED', '이용권 잔여횟수가 부족합니다.');
    }
    for (const row of rows.filter(active)) {
      if (row.pass_id !== passId) await tx.put('pass_usage_logs', tx.patch(row, { status: 'cancelled' }));
    }
    this.checkpoint('activity-after-cancel');
    if (passId) {
      const prior = rows.find((r) => r.pass_id === passId);
      if (!prior || !active(prior)) await tx.put('pass_usage_logs', prior
        ? tx.patch(prior, { status: 'used', used_count: 1, deleted_at: null })
        : tx.fresh({ pass_id: passId, exercise_log_id: log.id, status: 'used', used_count: 1, memo: '' }));
    }
    this.checkpoint('activity-after-usage');
  }
  async validateLog(tx, log, isNew) {
    const type = await tx.get('exercise_types', log.exercise_type_id, !isNew);
    const template = await tx.get('exercise_templates', log.template_id, true);
    requireRule(!isNew || (type.status === 'active' && template.status === 'active' && template.deleted_at === null), 'EXERCISE_TYPE_INACTIVE', '활성 운동과 최신 양식으로 다시 시도하세요.');
    requireRule(template.exercise_type_id === type.id, 'TEMPLATE_MISMATCH', '운동 양식이 일치하지 않습니다.');
    requireRule(Number.isFinite(Date.parse(log.performed_at)), 'LOG_DATE', '운동일을 확인하세요.');
    validateExerciseValues(template.fields, log.values);
  }
  saveLog({ id, data, expectedRevision }) {
    return this.run(async (tx) => {
      const old = id ? await tx.get('exercise_logs', id) : null;
      if (old) this.revision(old, expectedRevision);
      let log = old ? tx.patch(old, data) : tx.fresh(data);
      const rows = old ? await this.usages(tx, id) : [];
      const passId = data.pass_id === undefined ? (old?.pass_id ?? rows.find(active)?.pass_id ?? null) : data.pass_id;
      log.pass_id = passId;
      await this.validateLog(tx, log, !old);
      await tx.put('exercise_logs', log);
      this.checkpoint('activity-after-log');
      await this.debit(tx, log, passId);
      return log;
    });
  }
  deleteLog({ id, expectedRevision }) {
    return this.run(async (tx) => {
      const log = await tx.get('exercise_logs', id); this.revision(log, expectedRevision);
      const schedules = await tx.index('exercise_schedules', 'uq_profile_completed_log', [tx.profileId, id]);
      requireRule(!schedules.some((s) => s.status === 'completed' && s.deleted_at === null), 'SCHEDULE_LINKED', '예약 화면에서 완료 취소를 먼저 실행하세요.');
      const rows = await this.usages(tx, id);
      const next = tx.patch(log, { deleted_at: tx.now, pass_id: log.pass_id ?? rows.find(active)?.pass_id ?? null });
      await tx.put('exercise_logs', next); this.checkpoint('activity-after-log');
      await this.debit(tx, next, null); return next;
    });
  }
  restoreLog({ id, expectedRevision }) {
    return this.run(async (tx) => {
      const log = await tx.get('exercise_logs', id, true); this.revision(log, expectedRevision);
      requireRule(log.deleted_at !== null, 'EXERCISE_LOG_NOT_DELETED', '삭제된 기록만 복원할 수 있습니다.');
      const schedules = await tx.index('exercise_schedules', 'uq_profile_completed_log', [tx.profileId, id]);
      requireRule(schedules.length === 0, 'SCHEDULE_LINKED', '예약 화면에서 다시 완료하세요.');
      const next = tx.patch(log, { deleted_at: null });
      await this.validateLog(tx, next, false);
      await tx.put('exercise_logs', next); this.checkpoint('activity-after-log');
      await this.debit(tx, next, next.pass_id ?? null); return next;
    });
  }
  savePass({ id, data, expectedRevision }) {
    return this.run(async (tx) => {
      const old = id ? await tx.get('passes', id) : null;
      if (old) this.revision(old, expectedRevision);
      const next = old ? tx.patch(old, data) : tx.fresh(data); validatePass(next);
      const type = await tx.get('exercise_types', next.exercise_type_id, Boolean(old));
      requireRule(old || type.status === 'active', 'EXERCISE_TYPE_INACTIVE', '활성 운동을 선택하세요.');
      requireRule(!old || next.exercise_type_id === old.exercise_type_id, 'PASS_EXERCISE', '이용권의 운동 종류는 변경할 수 없습니다.');
      const rows = old ? await tx.index('pass_usage_logs', 'by_profile_pass_status', [tx.profileId, id, 'used']) : [];
      requireRule(next.total_count >= rows.filter(active).reduce((n, r) => n + r.used_count, 0), 'PASS_COUNT_USED', '이미 사용한 횟수보다 총 횟수를 낮출 수 없습니다.');
      const profile = await tx.get('profiles', tx.profileId);
      for (const row of rows.filter(active)) {
        const log = await tx.get('exercise_logs', row.exercise_log_id);
        const day = dateKey(log.performed_at, profile.timezone ?? 'Asia/Seoul');
        requireRule(day >= next.start_date && day <= next.expiry_date, 'PASS_DATES_USED', '사용한 운동일을 제외하도록 유효기간을 줄일 수 없습니다.');
      }
      return tx.put('passes', next);
    });
  }
  deletePass({ id, expectedRevision }) {
    return this.run(async (tx) => {
      const pass = await tx.get('passes', id); this.revision(pass, expectedRevision);
      const rows = await tx.index('pass_usage_logs', 'by_profile_pass', [tx.profileId, id]);
      return tx.put('passes', tx.patch(pass, rows.length ? { status: 'inactive' } : { deleted_at: tx.now }));
    });
  }
  saveSchedule({ id, data, expectedRevision }) {
    return this.run(async (tx) => {
      const old = id ? await tx.get('exercise_schedules', id) : null;
      if (old) this.revision(old, expectedRevision);
      requireRule(!old || old.status !== 'completed', 'SCHEDULE_COMPLETED', '완료 취소 후 예약을 수정하세요.');
      const next = old ? tx.patch(old, data) : tx.fresh(data);
      requireRule(['scheduled', 'cancelled'].includes(next.status), 'SCHEDULE_STATUS', '예약 상태가 올바르지 않습니다.');
      requireRule(!old?.completed_exercise_log_id || old.exercise_type_id === next.exercise_type_id, 'SCHEDULE_EXERCISE', '완료 이력이 있는 예약의 운동은 변경할 수 없습니다.');
      const type = await tx.get('exercise_types', next.exercise_type_id, Boolean(old));
      requireRule(old || type.status === 'active', 'EXERCISE_TYPE_INACTIVE', '활성 운동을 선택하세요.');
      return tx.put('exercise_schedules', next);
    });
  }
  completeSchedule({ id, data, expectedRevision }) {
    return this.run(async (tx) => {
      const schedule = await tx.get('exercise_schedules', id);
      // Retries from the same completion revision return the committed result, even concurrently.
      if (schedule.status === 'completed' && schedule.completion_revision === expectedRevision) return tx.get('exercise_logs', schedule.completed_exercise_log_id);
      this.revision(schedule, expectedRevision);
      requireRule(schedule.status === 'scheduled', 'SCHEDULE_STATUS', '예정 상태에서만 완료할 수 있습니다.');
      const prior = schedule.completed_exercise_log_id ? await tx.get('exercise_logs', schedule.completed_exercise_log_id, true) : null;
      requireRule(!prior || prior.deleted_at !== null, 'SCHEDULE_LOG_STATE', '연결 운동기록 상태를 확인하세요.');
      const log = prior ? tx.patch(prior, { ...data, template_id: prior.template_id, exercise_type_id: schedule.exercise_type_id, deleted_at: null }) : tx.fresh({ ...data, exercise_type_id: schedule.exercise_type_id });
      await this.validateLog(tx, log, !prior);
      await tx.put('exercise_logs', log); this.checkpoint('activity-after-log');
      await this.debit(tx, log, log.pass_id ?? null);
      await tx.put('exercise_schedules', tx.patch(schedule, { status: 'completed', completed_exercise_log_id: log.id, completion_revision: expectedRevision }));
      this.checkpoint('activity-after-schedule'); return log;
    });
  }
  undoSchedule({ id, expectedRevision }) {
    return this.run(async (tx) => {
      const schedule = await tx.get('exercise_schedules', id); this.revision(schedule, expectedRevision);
      requireRule(schedule.status === 'completed', 'SCHEDULE_STATUS', '완료 상태에서만 완료 취소할 수 있습니다.');
      const log = await tx.get('exercise_logs', schedule.completed_exercise_log_id);
      await tx.put('exercise_logs', tx.patch(log, { deleted_at: tx.now })); this.checkpoint('activity-after-log');
      await this.debit(tx, log, null);
      const next = await tx.put('exercise_schedules', tx.patch(schedule, { status: 'scheduled' }));
      this.checkpoint('activity-after-schedule'); return next;
    });
  }
}

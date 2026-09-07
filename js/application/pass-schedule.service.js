import { localDateTimeToUtcIso } from '../core/datetime.js';
import { normalizeExerciseMemo, validateExerciseValues } from '../core/exercise-fields.js';
import { requireRule, validatePass, dateKey } from '../core/pass-rules.js';
import { NotFoundError } from '../core/errors.js';

export class PassScheduleService {
  constructor({ command, repositories, identityContext }) { this.command = command; this.repositories = repositories; this.identity = identityContext; }
  async timezone() { return (await this.repositories.profile.getById(this.identity.getCurrentProfileId())).timezone ?? 'Asia/Seoul'; }
  async passes(exerciseTypeId) {
    const rows = await this.repositories.pass.listByExercise(exerciseTypeId);
    return Promise.all(rows.map(async (row) => {
      const history = await this.repositories.passUsage.listByPass(row.id, { includeDeleted: true });
      const used = history.filter((r) => r.deleted_at === null && r.status === 'used').reduce((n, r) => n + r.used_count, 0);
      return { ...row, used, remaining: row.total_count - used, history };
    }));
  }
  async availablePasses(exerciseTypeId, performedAtLocal) {
    const day = dateKey(localDateTimeToUtcIso(performedAtLocal, await this.timezone()), await this.timezone());
    return (await this.passes(exerciseTypeId)).filter((p) => p.status === 'active' && p.remaining > 0 && p.start_date <= day && day <= p.expiry_date)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  }
  async setPassStatus(id, status, expectedRevision) {
    requireRule(['active', 'inactive'].includes(status), 'PASS_STATUS', '이용권 상태를 확인하세요.');
    return this.command.savePass({ id, data: { status }, expectedRevision });
  }
  async calendarEntries(startLocal, endLocal) {
    const { schedules, logs } = await this.calendar(startLocal, endLocal);
    const timezone = await this.timezone();
    const start = localDateTimeToUtcIso(startLocal, timezone), end = localDateTimeToUtcIso(endLocal, timezone);
    const linked = new Map(schedules.map((s) => [s.id, s]));
    for (const log of logs) {
      const schedule = await this.repositories.exerciseSchedule.findByCompletedLog(log.id);
      if (schedule) linked.set(schedule.id, schedule);
    }
    const consumed = new Set(), entries = [];
    for (const schedule of linked.values()) {
      const log = schedule.status === 'completed' && schedule.completed_exercise_log_id
        ? await this.repositories.exerciseLog.getById(schedule.completed_exercise_log_id) : null;
      if (log) consumed.add(log.id);
      entries.push({ id: schedule.id, schedule, log, at: log?.performed_at ?? schedule.scheduled_at, exercise_type_id: schedule.exercise_type_id, label: log ? '완료 · 운동기록' : ({ scheduled: '예정', cancelled: '취소', completed: '완료' }[schedule.status]), memo: log?.memo ?? schedule.memo });
    }
    for (const log of logs) if (!consumed.has(log.id)) entries.push({ id: log.id, log, schedule: null, at: log.performed_at, exercise_type_id: log.exercise_type_id, label: '운동기록', memo: log.memo });
    return entries.filter((r) => r.at >= start && r.at < end).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
  async selectedPass(log) {
    const history = await this.repositories.passUsage.listByLog(log.id);
    return log.pass_id ?? history.find((r) => r.status === 'used')?.pass_id ?? null;
  }
  async savePass(input, id, expectedRevision) {
    const data = { exercise_type_id: input.exercise_type_id, name: String(input.name ?? '').trim(), total_count: Number(input.total_count), start_date: input.start_date, expiry_date: input.expiry_date, status: input.status ?? 'active', memo: normalizeExerciseMemo(input.memo) };
    validatePass(data);
    return this.command.savePass({ id, data, expectedRevision });
  }
  deletePass(id, expectedRevision) { return this.command.deletePass({ id, expectedRevision }); }
  async schedule(id) {
    const row = await this.repositories.exerciseSchedule.getById(id);
    if (!row) throw new NotFoundError('SCHEDULE_NOT_FOUND', '예약을 찾을 수 없습니다.');
    return row;
  }
  async calendar(startLocal, endLocal) {
    const tz = await this.timezone();
    const start = localDateTimeToUtcIso(startLocal, tz), end = localDateTimeToUtcIso(endLocal, tz);
    requireRule(start < end, 'DATE_RANGE', '조회 종료일은 시작일 이후여야 합니다.');
    const [schedules, logs] = await Promise.all([
      this.repositories.exerciseSchedule.listByDateRange(start, end),
      this.repositories.exerciseLog.listByDateRange(start, end)
    ]);
    return { schedules, logs };
  }
  async saveSchedule(input, id, expectedRevision) {
    const data = { exercise_type_id: input.exercise_type_id, scheduled_at: localDateTimeToUtcIso(input.scheduled_at_local, await this.timezone()), expected_duration_minutes: Number(input.expected_duration_minutes), memo: normalizeExerciseMemo(input.memo), status: input.status ?? 'scheduled' };
    requireRule(Number.isFinite(data.expected_duration_minutes) && data.expected_duration_minutes > 0 && data.expected_duration_minutes <= 1440, 'SCHEDULE_DURATION', '예정 시간은 0 초과 1440 이하의 분으로 입력하세요.');
    return this.command.saveSchedule({ id, data, expectedRevision });
  }
  async cancelSchedule(id, expectedRevision) {
    return this.command.saveSchedule({ id, expectedRevision, data: { status: 'cancelled' } });
  }
  async completionTemplate(schedule) {
    if (schedule.completed_exercise_log_id) {
      const log = await this.repositories.exerciseLog.getByIdIncludingDeleted(schedule.completed_exercise_log_id);
      return this.repositories.exerciseTemplate.getByIdIncludingDeleted(log.template_id);
    }
    const templates = await this.repositories.exerciseTemplate.list({ predicate: (r) => r.exercise_type_id === schedule.exercise_type_id && r.status === 'active' });
    requireRule(templates.length === 1, 'EXERCISE_TEMPLATE_STATE_INVALID', '활성 운동 양식을 확인하세요.');
    return templates[0];
  }
  async completeSchedule(id, input, expectedRevision) {
    const schedule = await this.schedule(id);
    const template = await this.completionTemplate(schedule);
    const data = { exercise_type_id: schedule.exercise_type_id, template_id: template.id, performed_at: localDateTimeToUtcIso(input.performed_at_local, await this.timezone()), values: validateExerciseValues(template.fields, input.values ?? {}), memo: normalizeExerciseMemo(input.memo), pass_id: input.pass_id ?? null };
    return this.command.completeSchedule({ id, data, expectedRevision });
  }
  undoSchedule(id, expectedRevision) { return this.command.undoSchedule({ id, expectedRevision }); }
}

import { normalizeExerciseMemo, validateExerciseValues } from '../core/exercise-fields.js';
import { localDateTimeToUtcIso } from '../core/datetime.js';
import { NotFoundError, ValidationError } from '../core/errors.js';

export class ExerciseLogService {
  #exerciseTypeRepository;
  #exerciseTemplateRepository;
  #exerciseLogRepository;
  #profileRepository;
  #identityContext;
  #activityCommand;

  constructor({ exerciseTypeRepository, exerciseTemplateRepository, exerciseLogRepository, profileRepository, identityContext, activityCommand }) {
    this.#exerciseTypeRepository = exerciseTypeRepository;
    this.#exerciseTemplateRepository = exerciseTemplateRepository;
    this.#exerciseLogRepository = exerciseLogRepository;
    this.#profileRepository = profileRepository;
    this.#identityContext = identityContext;
    this.#activityCommand = activityCommand;
  }

  async #timezone() {
    const profile = await this.#profileRepository.getById(this.#identityContext.getCurrentProfileId());
    return profile?.timezone ?? globalThis.APP_CONFIG.DEFAULT_TIMEZONE;
  }

  async #type(id, { includeDeleted = false } = {}) {
    const type = includeDeleted
      ? await this.#exerciseTypeRepository.getByIdIncludingDeleted(id)
      : await this.#exerciseTypeRepository.getById(id);
    if (!type) throw new NotFoundError('EXERCISE_TYPE_NOT_FOUND', '운동 종류를 찾을 수 없습니다.');
    return type;
  }

  async #template(id) {
    const template = await this.#exerciseTemplateRepository.getByIdIncludingDeleted(id);
    if (!template) throw new NotFoundError('EXERCISE_TEMPLATE_NOT_FOUND', '운동 기록 양식을 찾을 수 없습니다.');
    return template;
  }

  async #activeTemplate(exerciseTypeId) {
    const templates = await this.#exerciseTemplateRepository.list({
      predicate: (item) => item.exercise_type_id === exerciseTypeId && item.status === 'active'
    });
    if (templates.length !== 1) throw new ValidationError('EXERCISE_TEMPLATE_STATE_INVALID', '활성 운동 양식 상태가 올바르지 않습니다.');
    return templates[0];
  }

  async create(input) {
    const type = await this.#type(input.exercise_type_id);
    if (type.status !== 'active') throw new ValidationError('EXERCISE_TYPE_INACTIVE', '비활성 운동에는 새 기록을 추가할 수 없습니다.');
    const template = await this.#activeTemplate(type.id);
    const timezone = await this.#timezone();
    const performedAt = localDateTimeToUtcIso(input.performed_at_local, timezone);
    const values = validateExerciseValues(template.fields, input.values ?? {});
    const memo = normalizeExerciseMemo(input.memo);
    return this.#activityCommand.saveLog({ data: {
      exercise_type_id: type.id,
      template_id: template.id,
      performed_at: performedAt,
      values,
      memo,
      pass_id: input.pass_id ?? null
    } });
  }

  async getDetail(id, { includeDeleted = false } = {}) {
    const log = includeDeleted
      ? await this.#exerciseLogRepository.getByIdIncludingDeleted(id)
      : await this.#exerciseLogRepository.getById(id);
    if (!log) throw new NotFoundError('EXERCISE_LOG_NOT_FOUND', '운동 기록을 찾을 수 없습니다.');
    const [type, template] = await Promise.all([
      this.#type(log.exercise_type_id, { includeDeleted: true }),
      this.#template(log.template_id)
    ]);
    return { log, exerciseType: type, template };
  }

  async update(id, input, expectedRevision) {
    const detail = await this.getDetail(id);
    const timezone = await this.#timezone();
    const performedAt = localDateTimeToUtcIso(input.performed_at_local, timezone);
    const values = validateExerciseValues(detail.template.fields, input.values ?? {});
    const memo = normalizeExerciseMemo(input.memo);
    return this.#activityCommand.saveLog({ id, data: {
      performed_at: performedAt,
      values,
      memo,
      ...(input.pass_id !== undefined ? { pass_id: input.pass_id } : {})
    }, expectedRevision });
  }

  async softDelete(id, expectedRevision) {
    await this.getDetail(id);
    return this.#activityCommand.deleteLog({ id, expectedRevision });
  }

  async restore(id, expectedRevision) {
    const detail = await this.getDetail(id, { includeDeleted: true });
    if (detail.log.deleted_at === null) throw new ValidationError('EXERCISE_LOG_NOT_DELETED', '삭제된 운동 기록만 복원할 수 있습니다.');
    return this.#activityCommand.restoreLog({ id, expectedRevision });
  }
}

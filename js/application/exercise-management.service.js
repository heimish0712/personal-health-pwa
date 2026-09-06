import {
  areTemplateFieldsEqual,
  normalizeExerciseTypeInput,
  normalizeTemplateFields
} from '../core/exercise-fields.js';
import { NotFoundError, ValidationError } from '../core/errors.js';

function sortTypes(a, b) {
  if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
  if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  return a.name.localeCompare(b.name, 'ko');
}

export class ExerciseManagementService {
  #exerciseTypeRepository;
  #exerciseTemplateRepository;
  #exerciseManagementCommand;
  #idGenerator;

  constructor({ exerciseTypeRepository, exerciseTemplateRepository, exerciseManagementCommand, idGenerator }) {
    this.#exerciseTypeRepository = exerciseTypeRepository;
    this.#exerciseTemplateRepository = exerciseTemplateRepository;
    this.#exerciseManagementCommand = exerciseManagementCommand;
    this.#idGenerator = idGenerator;
  }

  async listExerciseTypes({ includeDeleted = false } = {}) {
    return this.#exerciseTypeRepository.list({ includeDeleted, sort: sortTypes });
  }

  async getExerciseType(id, { includeDeleted = false } = {}) {
    const type = includeDeleted
      ? await this.#exerciseTypeRepository.getByIdIncludingDeleted(id)
      : await this.#exerciseTypeRepository.getById(id);
    if (!type) throw new NotFoundError('EXERCISE_TYPE_NOT_FOUND', '운동 종류를 찾을 수 없습니다.');
    return type;
  }

  async getActiveTemplate(exerciseTypeId) {
    const templates = await this.#exerciseTemplateRepository.list({
      predicate: (item) => item.exercise_type_id === exerciseTypeId && item.status === 'active',
      sort: (a, b) => b.version - a.version
    });
    if (templates.length !== 1) {
      throw new ValidationError('EXERCISE_TEMPLATE_STATE_INVALID', '활성 운동 양식 상태가 올바르지 않습니다.');
    }
    return templates[0];
  }

  async getTemplateById(templateId, { includeDeleted = true } = {}) {
    const template = includeDeleted
      ? await this.#exerciseTemplateRepository.getByIdIncludingDeleted(templateId)
      : await this.#exerciseTemplateRepository.getById(templateId);
    if (!template) throw new NotFoundError('EXERCISE_TEMPLATE_NOT_FOUND', '운동 기록 양식을 찾을 수 없습니다.');
    return template;
  }

  async createExerciseType(input) {
    const type = normalizeExerciseTypeInput(input);
    const existing = await this.#exerciseTypeRepository.list({ includeDeleted: false });
    const sortOrder = existing.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), 0) + 1;
    const fields = normalizeTemplateFields(input.fields ?? [], { idGenerator: this.#idGenerator });
    return this.#exerciseManagementCommand.createExerciseTypeWithTemplate({
      exerciseType: { ...type, sort_order: sortOrder },
      fields
    });
  }

  async updateExerciseType(id, input, expectedRevision) {
    const current = await this.getExerciseType(id);
    const normalized = normalizeExerciseTypeInput({ ...current, ...input });
    return this.#exerciseTypeRepository.update(id, normalized, expectedRevision);
  }

  async setExerciseTypeStatus(id, status, expectedRevision) {
    if (!['active', 'inactive'].includes(status)) {
      throw new ValidationError('EXERCISE_STATUS_INVALID', '운동 상태가 올바르지 않습니다.');
    }
    await this.getExerciseType(id);
    return this.#exerciseTypeRepository.update(id, { status }, expectedRevision);
  }

  async softDeleteExerciseType(id, expectedRevision) {
    await this.getExerciseType(id);
    return this.#exerciseTypeRepository.softDelete(id, expectedRevision);
  }

  async restoreExerciseType(id, expectedRevision) {
    const current = await this.getExerciseType(id, { includeDeleted: true });
    if (current.deleted_at === null) throw new ValidationError('EXERCISE_TYPE_NOT_DELETED', '삭제된 운동만 복원할 수 있습니다.');
    return this.#exerciseTypeRepository.restore(id, expectedRevision);
  }

  async createTemplateVersion(exerciseTypeId, rawFields, { expectedTemplateId, expectedTemplateRevision }) {
    await this.getExerciseType(exerciseTypeId);
    const current = await this.getActiveTemplate(exerciseTypeId);
    const fields = normalizeTemplateFields(rawFields, { idGenerator: this.#idGenerator });

    if (current.id === expectedTemplateId
      && current.revision === expectedTemplateRevision
      && areTemplateFieldsEqual(current.fields, fields)) {
      throw new ValidationError('EXERCISE_TEMPLATE_UNCHANGED', '기록 양식에 변경사항이 없습니다.');
    }

    return this.#exerciseManagementCommand.createNewTemplateVersion({
      exerciseTypeId,
      expectedTemplateId,
      expectedTemplateRevision,
      fields
    });
  }
}

import { ExerciseManagementCommandContract } from '../../contracts/exercise-management-command.contract.js';
import { createScopedEntity, cloneValue } from '../../../core/entity-metadata.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors.js';
import { requestToPromise } from '../idb-request.js';
import { STORE_NAMES } from '../schema.js';

export class IndexedDbExerciseManagementCommand extends ExerciseManagementCommandContract {
  #unitOfWork;
  #identityContext;
  #clock;
  #idGenerator;
  #faultInjector;

  constructor({ unitOfWork, identityContext, clock, idGenerator, faultInjector = null }) {
    super();
    this.#unitOfWork = unitOfWork;
    this.#identityContext = identityContext;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#faultInjector = faultInjector;
  }

  async createExerciseTypeWithTemplate({ exerciseType, fields }) {
    const profileId = this.#identityContext.getCurrentProfileId();
    return this.#unitOfWork.run([
      STORE_NAMES.EXERCISE_TYPES,
      STORE_NAMES.EXERCISE_TEMPLATES
    ], 'readwrite', async ({ store }) => {
      const nowIso = this.#clock.nowIso();
      const typeEntity = createScopedEntity({
        data: exerciseType,
        id: this.#idGenerator.generate(),
        profileId,
        nowIso
      });
      const templateEntity = createScopedEntity({
        data: {
          exercise_type_id: typeEntity.id,
          version: 1,
          status: 'active',
          fields: cloneValue(fields)
        },
        id: this.#idGenerator.generate(),
        profileId,
        nowIso
      });

      await requestToPromise(store(STORE_NAMES.EXERCISE_TYPES).add(typeEntity));
      this.#checkpoint('after-exercise-type');
      await requestToPromise(store(STORE_NAMES.EXERCISE_TEMPLATES).add(templateEntity));
      this.#checkpoint('after-exercise-template');
      return { exerciseType: cloneValue(typeEntity), template: cloneValue(templateEntity) };
    });
  }

  async createNewTemplateVersion({ exerciseTypeId, expectedTemplateId, expectedTemplateRevision, fields }) {
    const profileId = this.#identityContext.getCurrentProfileId();
    return this.#unitOfWork.run([
      STORE_NAMES.EXERCISE_TYPES,
      STORE_NAMES.EXERCISE_TEMPLATES
    ], 'readwrite', async ({ store }) => {
      const typeStore = store(STORE_NAMES.EXERCISE_TYPES);
      const templateStore = store(STORE_NAMES.EXERCISE_TEMPLATES);
      const exerciseType = await requestToPromise(typeStore.get(exerciseTypeId));
      if (!exerciseType || exerciseType.profile_id !== profileId || exerciseType.deleted_at !== null) {
        throw new NotFoundError('EXERCISE_TYPE_NOT_FOUND', '운동 종류를 찾을 수 없습니다.');
      }

      const templates = await requestToPromise(
        templateStore.index('by_profile_exercise').getAll([profileId, exerciseTypeId])
      );
      const active = templates.filter((item) => item.deleted_at === null && item.status === 'active');
      if (active.length !== 1) {
        throw new ValidationError('EXERCISE_TEMPLATE_STATE_INVALID', '활성 운동 양식 상태가 올바르지 않습니다.');
      }
      const current = active[0];
      if (current.id !== expectedTemplateId || current.revision !== expectedTemplateRevision) {
        throw new ConflictError('REVISION_CONFLICT', '운동 기록 양식이 다른 곳에서 변경되었습니다.', {
          details: { expectedTemplateId, expectedTemplateRevision, actualTemplateId: current.id, actualRevision: current.revision }
        });
      }

      const maxVersion = templates.reduce((max, item) => Math.max(max, Number(item.version) || 0), 0);
      const nowIso = this.#clock.nowIso();
      const superseded = {
        ...current,
        status: 'superseded',
        updated_at: nowIso,
        revision: current.revision + 1
      };
      const next = createScopedEntity({
        data: {
          exercise_type_id: exerciseTypeId,
          version: maxVersion + 1,
          status: 'active',
          fields: cloneValue(fields)
        },
        id: this.#idGenerator.generate(),
        profileId,
        nowIso
      });

      await requestToPromise(templateStore.put(superseded));
      this.#checkpoint('after-template-supersede');
      await requestToPromise(templateStore.add(next));
      this.#checkpoint('after-template-create');
      return { previousTemplate: cloneValue(superseded), template: cloneValue(next) };
    });
  }

  #checkpoint(name) {
    if (!this.#faultInjector) return;
    const result = typeof this.#faultInjector === 'function'
      ? this.#faultInjector(name)
      : this.#faultInjector.checkpoint?.(name);
    if (result && typeof result.then === 'function') {
      throw new Error('Exercise fault injector must be synchronous inside an IndexedDB transaction.');
    }
  }
}

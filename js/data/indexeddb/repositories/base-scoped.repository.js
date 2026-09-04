import { RepositoryContract } from '../../contracts/repository.contract.js';
import {
  applyPatch,
  cloneValue,
  createScopedEntity
} from '../../../core/entity-metadata.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from '../../../core/errors.js';
import { requestToPromise } from '../idb-request.js';

function assertExpectedRevision(expectedRevision) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new ValidationError('REVISION_INVALID', 'expectedRevision must be a positive integer.');
  }
}

export class BaseScopedRepository extends RepositoryContract {
  #database;
  #storeName;
  #identityContext;
  #clock;
  #idGenerator;

  constructor({ database, storeName, identityContext, clock, idGenerator }) {
    super();
    this.#database = database;
    this.#storeName = storeName;
    this.#identityContext = identityContext;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  get storeName() {
    return this.#storeName;
  }

  async getById(id) {
    const entity = await this.getByIdIncludingDeleted(id);
    return entity && entity.deleted_at === null ? entity : null;
  }

  async getByIdIncludingDeleted(id) {
    const profileId = this.#identityContext.getCurrentProfileId();
    return this.#database.runTransaction([this.#storeName], 'readonly', async ({ store }) => {
      const entity = await requestToPromise(store(this.#storeName).get(id));
      if (!entity || entity.profile_id !== profileId) return null;
      return cloneValue(entity);
    });
  }

  async list({ includeDeleted = false, predicate = null, sort = null } = {}) {
    const profileId = this.#identityContext.getCurrentProfileId();
    const records = await this.#database.runTransaction([this.#storeName], 'readonly', async ({ store }) => {
      return requestToPromise(store(this.#storeName).getAll());
    });

    let filtered = records.filter((entity) => (
      entity.profile_id === profileId
      && (includeDeleted || entity.deleted_at === null)
      && (typeof predicate !== 'function' || predicate(entity))
    ));

    if (typeof sort === 'function') filtered = filtered.sort(sort);
    return cloneValue(filtered);
  }

  async count(query = {}) {
    const records = await this.list(query);
    return records.length;
  }

  async create(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new ValidationError('ENTITY_INVALID', 'Entity data must be an object.');
    }

    const entity = createScopedEntity({
      data,
      id: this.#idGenerator.generate(),
      profileId: this.#identityContext.getCurrentProfileId(),
      nowIso: this.#clock.nowIso()
    });

    await this.#database.runTransaction([this.#storeName], 'readwrite', async ({ store }) => {
      await requestToPromise(store(this.#storeName).add(entity));
    });

    return cloneValue(entity);
  }

  async update(id, patch, expectedRevision) {
    assertExpectedRevision(expectedRevision);
    return this.#mutate(id, expectedRevision, (current) => {
      if (current.deleted_at !== null) {
        throw new NotFoundError('ENTITY_DELETED', 'Deleted entities cannot be updated.');
      }
      return applyPatch(current, patch, this.#clock.nowIso());
    });
  }

  async softDelete(id, expectedRevision) {
    assertExpectedRevision(expectedRevision);
    return this.#mutate(id, expectedRevision, (current) => {
      if (current.deleted_at !== null) {
        throw new NotFoundError('ENTITY_ALREADY_DELETED', 'Entity is already deleted.');
      }
      const nowIso = this.#clock.nowIso();
      return {
        ...current,
        deleted_at: nowIso,
        updated_at: nowIso,
        revision: current.revision + 1
      };
    });
  }

  async restore(id, expectedRevision) {
    assertExpectedRevision(expectedRevision);
    return this.#mutate(id, expectedRevision, (current) => {
      if (current.deleted_at === null) {
        throw new ValidationError('ENTITY_NOT_DELETED', 'Only deleted entities can be restored.');
      }
      return {
        ...current,
        deleted_at: null,
        updated_at: this.#clock.nowIso(),
        revision: current.revision + 1
      };
    });
  }

  async #mutate(id, expectedRevision, mutator) {
    const profileId = this.#identityContext.getCurrentProfileId();

    return this.#database.runTransaction([this.#storeName], 'readwrite', async ({ store }) => {
      const objectStore = store(this.#storeName);
      const current = await requestToPromise(objectStore.get(id));

      if (!current || current.profile_id !== profileId) {
        throw new NotFoundError('ENTITY_NOT_FOUND', 'Entity was not found in the current profile.');
      }

      if (current.revision !== expectedRevision) {
        throw new ConflictError(
          'REVISION_CONFLICT',
          `Expected revision ${expectedRevision}, but found ${current.revision}.`,
          { details: { id, expectedRevision, actualRevision: current.revision } }
        );
      }

      const next = mutator(cloneValue(current));
      await requestToPromise(objectStore.put(next));
      return cloneValue(next);
    });
  }
}

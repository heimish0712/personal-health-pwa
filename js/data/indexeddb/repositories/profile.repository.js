import {
  applyPatch,
  cloneValue,
  createProfileEntity
} from '../../../core/entity-metadata.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from '../../../core/errors.js';
import { STORE_NAMES } from '../schema.js';
import { requestToPromise } from '../idb-request.js';

export class ProfileRepository {
  #database;
  #clock;
  #idGenerator;

  constructor({ database, clock, idGenerator }) {
    this.#database = database;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  async create(data) {
    const entity = createProfileEntity({
      data,
      id: this.#idGenerator.generate(),
      nowIso: this.#clock.nowIso()
    });

    await this.#database.runTransaction([STORE_NAMES.PROFILES], 'readwrite', async ({ store }) => {
      await requestToPromise(store(STORE_NAMES.PROFILES).add(entity));
    });
    return cloneValue(entity);
  }

  async getById(id, { includeDeleted = false } = {}) {
    return this.#database.runTransaction([STORE_NAMES.PROFILES], 'readonly', async ({ store }) => {
      const entity = await requestToPromise(store(STORE_NAMES.PROFILES).get(id));
      if (!entity || (!includeDeleted && entity.deleted_at !== null)) return null;
      return cloneValue(entity);
    });
  }

  async list({ includeDeleted = false } = {}) {
    const records = await this.#database.runTransaction([STORE_NAMES.PROFILES], 'readonly', async ({ store }) => {
      return requestToPromise(store(STORE_NAMES.PROFILES).getAll());
    });
    return cloneValue(records
      .filter((entity) => includeDeleted || entity.deleted_at === null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)));
  }

  async update(id, patch, expectedRevision) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new ValidationError('REVISION_INVALID', 'expectedRevision must be a positive integer.');
    }

    return this.#database.runTransaction([STORE_NAMES.PROFILES], 'readwrite', async ({ store }) => {
      const objectStore = store(STORE_NAMES.PROFILES);
      const current = await requestToPromise(objectStore.get(id));
      if (!current || current.deleted_at !== null) {
        throw new NotFoundError('PROFILE_NOT_FOUND', 'Profile was not found.');
      }
      if (current.revision !== expectedRevision) {
        throw new ConflictError('REVISION_CONFLICT', 'Profile revision does not match.');
      }

      const next = applyPatch(current, patch, this.#clock.nowIso());
      await requestToPromise(objectStore.put(next));
      return cloneValue(next);
    });
  }
}

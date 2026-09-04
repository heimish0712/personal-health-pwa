import { cloneValue } from '../../../core/entity-metadata.js';
import { STORE_NAMES } from '../schema.js';
import { requestToPromise } from '../idb-request.js';

export class AppLogRepository {
  #database;
  #clock;
  #idGenerator;
  #limit;

  constructor({ database, clock, idGenerator, limit = globalThis.APP_CONFIG.APP_LOG_LIMIT }) {
    this.#database = database;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#limit = limit;
  }

  async append({ level, event, message, context = null }) {
    const record = {
      id: this.#idGenerator.generate(),
      level,
      event,
      message,
      context: cloneValue(context),
      created_at: this.#clock.nowIso()
    };

    await this.#database.runTransaction([STORE_NAMES.APP_LOGS], 'readwrite', async ({ store }) => {
      const objectStore = store(STORE_NAMES.APP_LOGS);
      await requestToPromise(objectStore.add(record));
      const records = await requestToPromise(objectStore.index('by_created_at').getAll());
      const overflow = records.length - this.#limit;
      for (let index = 0; index < overflow; index += 1) {
        await requestToPromise(objectStore.delete(records[index].id));
      }
    });

    return cloneValue(record);
  }

  async listRecent(limit = 20) {
    const records = await this.#database.runTransaction([STORE_NAMES.APP_LOGS], 'readonly', async ({ store }) => {
      return requestToPromise(store(STORE_NAMES.APP_LOGS).index('by_created_at').getAll());
    });
    return cloneValue(records.slice(-limit).reverse());
  }

  async count() {
    return this.#database.runTransaction([STORE_NAMES.APP_LOGS], 'readonly', async ({ store }) => {
      return requestToPromise(store(STORE_NAMES.APP_LOGS).count());
    });
  }
}

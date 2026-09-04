import { cloneValue } from '../../../core/entity-metadata.js';
import { STORE_NAMES } from '../schema.js';
import { requestToPromise } from '../idb-request.js';

export class DeviceSettingsRepository {
  #database;
  #clock;

  constructor({ database, clock }) {
    this.#database = database;
    this.#clock = clock;
  }

  async get(key) {
    return this.#database.runTransaction([STORE_NAMES.DEVICE_SETTINGS], 'readonly', async ({ store }) => {
      const setting = await requestToPromise(store(STORE_NAMES.DEVICE_SETTINGS).get(key));
      return setting ? cloneValue(setting) : null;
    });
  }

  async set(key, value) {
    return this.#database.runTransaction([STORE_NAMES.DEVICE_SETTINGS], 'readwrite', async ({ store }) => {
      const objectStore = store(STORE_NAMES.DEVICE_SETTINGS);
      const current = await requestToPromise(objectStore.get(key));
      const nowIso = this.#clock.nowIso();
      const setting = {
        key,
        value: cloneValue(value),
        created_at: current?.created_at ?? nowIso,
        updated_at: nowIso
      };
      await requestToPromise(objectStore.put(setting));
      return cloneValue(setting);
    });
  }
}

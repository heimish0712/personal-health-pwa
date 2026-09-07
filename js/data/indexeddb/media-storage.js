import { MediaStorageContract } from '../contracts/media-storage.contract.js';
import { requestToPromise as request } from './idb-request.js';
import { photoKeys } from '../../core/media-rules.js';
export class IndexedDbMediaStorage extends MediaStorageContract {
  constructor({ database }) { super(); this.database = database; }
  read(key) { return this.database.runTransaction(['media_blobs'], 'readonly', ({ store }) => request(store('media_blobs').get(key))); }
  async scan(store, remove = false) {
    const photos = await request(store('diet_photos').getAll());
    const all = new Set(photos.flatMap(photoKeys)), active = new Set(photos.filter((p) => p.deleted_at === null).flatMap(photoKeys));
    const result = { bytes: 0, count: 0, inactiveKeys: [], orphanKeys: [], orphanBytes: 0, removed: 0 };
    await new Promise((resolve, reject) => {
      const req = store('media_blobs').openCursor(); req.onerror = () => reject(req.error);
      req.onsuccess = () => { const cursor = req.result; if (!cursor) return resolve();
        const row = cursor.value, bytes = row.blob?.size ?? row.byte_size ?? 0;
        result.bytes += bytes; result.count++;
        if (!active.has(row.storage_key)) result.inactiveKeys.push(row.storage_key);
        if (!all.has(row.storage_key)) { result.orphanKeys.push(row.storage_key); result.orphanBytes += bytes; if (remove) { cursor.delete(); result.removed++; } }
        cursor.continue();
      };
    });
    return result;
  }

  statistics() { return this.database.runTransaction(['media_blobs','diet_photos'], 'readonly', ({ store }) => this.scan(store)); }
  // Recheck references in the deletion transaction, including tombstones of every Profile.
  collectOrphans() { return this.database.runTransaction(['media_blobs','diet_photos'], 'readwrite', ({ store }) => this.scan(store, true)); }
}

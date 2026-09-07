import { MediaStorageContract } from '../contracts/media-storage.contract.js';
import { requestToPromise as request } from './idb-request.js';
import { photoKeys } from '../../core/media-rules.js';
export class IndexedDbMediaStorage extends MediaStorageContract {
  constructor({ database }) { super(); this.database = database; }
  read(key) { return this.database.runTransaction(['media_blobs'], 'readonly', ({ store }) => request(store('media_blobs').get(key))); }
  async scan(store, remove = false) {
    const photos = await request(store('diet_photos').getAll()), rows = await request(store('media_blobs').getAll());
    const all = new Set(photos.flatMap(photoKeys)), active = new Set(photos.filter((p) => p.deleted_at === null).flatMap(photoKeys));
    const orphans = rows.filter((r) => !all.has(r.storage_key));
    if (remove) for (const row of orphans) await request(store('media_blobs').delete(row.storage_key));
    return { bytes: rows.reduce((n,r) => n + r.byte_size,0), count: rows.length, inactiveKeys: rows.filter((r) => !active.has(r.storage_key)).map((r) => r.storage_key), orphanKeys: orphans.map((r) => r.storage_key), removed: remove ? orphans.length : 0 };
  }
  statistics() { return this.database.runTransaction(['media_blobs','diet_photos'], 'readonly', ({ store }) => this.scan(store)); }
  // Recheck references in the deletion transaction, including tombstones of every Profile.
  collectOrphans() { return this.database.runTransaction(['media_blobs','diet_photos'], 'readwrite', ({ store }) => this.scan(store, true)); }
}

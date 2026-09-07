import { BackupSnapshotReaderContract } from '../../contracts/backup-snapshot-reader.contract.js';
import { BACKUP_STORE_NAMES, sortBackupData } from '../../../core/backup/backup-format.js';
import { requestToPromise } from '../idb-request.js';

export async function readPortableStores(store) {
  const entries = await Promise.all(BACKUP_STORE_NAMES.map(async (name) => [name, await requestToPromise(store(name).getAll())]));
  return Object.fromEntries(entries);
}

export class IndexedDbBackupSnapshotReader extends BackupSnapshotReaderContract {
  constructor({ unitOfWork, identityContext }) { super(); this.unitOfWork = unitOfWork; this.identityContext = identityContext; }
  async readCurrentProfile({ includeMedia = false } = {}) {
    const profileId = this.identityContext.getCurrentProfileId();
    const result = await this.unitOfWork.run(includeMedia ? [...BACKUP_STORE_NAMES, 'media_blobs'] : BACKUP_STORE_NAMES, 'readonly', async ({ store }) => {
      const all = await readPortableStores(store);
      const data = Object.fromEntries(BACKUP_STORE_NAMES.map((name) => [name, all[name].filter((row) => name === 'profiles' ? row.id === profileId : row.profile_id === profileId)]));
      const media = [];
      if (includeMedia) for (const photo of data.diet_photos) for (const key of [photo.storage_key, photo.thumbnail_storage_key]) { const row = await requestToPromise(store('media_blobs').get(key ?? '')); if (row) media.push(row); }
      return { data, media };
    });
    return { profileId, data: sortBackupData(result.data), ...(includeMedia ? { media: result.media } : {}) };
  }
}

import { BackupSnapshotReaderContract } from '../../contracts/backup-snapshot-reader.contract.js';
import { BACKUP_STORE_NAMES, backupStores, sortBackupData } from '../../../core/backup/backup-format.js';
import { requestToPromise } from '../idb-request.js';

export async function readPortableStores(store, names = BACKUP_STORE_NAMES) {
  const entries = await Promise.all(names.map(async (name) => [name, await requestToPromise(store(name).getAll())]));
  return Object.fromEntries(entries);
}

export class IndexedDbBackupSnapshotReader extends BackupSnapshotReaderContract {
  constructor({ unitOfWork, identityContext, dbVersion = globalThis.APP_CONFIG.DB_VERSION }) { super(); this.dbVersion = dbVersion; this.names = backupStores(dbVersion >= 3 ? 2 : 1); this.unitOfWork = unitOfWork; this.identityContext = identityContext; }
  async readCurrentProfile({ includeMedia = false } = {}) {
    const profileId = this.identityContext.getCurrentProfileId();
    const result = await this.unitOfWork.run(includeMedia ? [...this.names, ...(this.dbVersion >= 2 ? ['media_blobs'] : [])] : this.names, 'readonly', async ({ store }) => {
      const all = await readPortableStores(store, this.names);
      const data = Object.fromEntries(this.names.map((name) => [name, all[name].filter((row) => name === 'profiles' ? row.id === profileId : row.profile_id === profileId)]));
      const media = includeMedia && this.dbVersion >= 2 ? (await Promise.all(data.diet_photos.flatMap((photo) => [photo.storage_key, photo.thumbnail_storage_key]).map((key) => requestToPromise(store('media_blobs').get(key ?? ''))))).filter(Boolean) : [];
      return { data, media };
    });
    return { profileId, data: sortBackupData(result.data), ...(includeMedia ? { media: result.media } : {}) };
  }
}

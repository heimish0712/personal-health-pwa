import { BackupSnapshotReaderContract } from '../../contracts/backup-snapshot-reader.contract.js';
import { BACKUP_STORE_NAMES, sortBackupData } from '../../../core/backup/backup-format.js';
import { requestToPromise } from '../idb-request.js';

export async function readPortableStores(store) {
  const entries = await Promise.all(BACKUP_STORE_NAMES.map(async (name) => [name, await requestToPromise(store(name).getAll())]));
  return Object.fromEntries(entries);
}

export class IndexedDbBackupSnapshotReader extends BackupSnapshotReaderContract {
  constructor({ unitOfWork, identityContext }) { super(); this.unitOfWork = unitOfWork; this.identityContext = identityContext; }
  async readCurrentProfile() {
    const profileId = this.identityContext.getCurrentProfileId();
    const data = await this.unitOfWork.run(BACKUP_STORE_NAMES, 'readonly', async ({ store }) => {
      const all = await readPortableStores(store);
      return Object.fromEntries(BACKUP_STORE_NAMES.map((name) => [name, all[name].filter((row) => name === 'profiles' ? row.id === profileId : row.profile_id === profileId)]));
    });
    return { profileId, data: sortBackupData(data) };
  }
}

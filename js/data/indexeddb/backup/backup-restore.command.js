import { BackupRestoreCommandContract } from '../../contracts/backup-restore-command.contract.js';
import { BACKUP_STORE_NAMES, backupError } from '../../../core/backup/backup-format.js';
import { validateBackupRows } from '../../../core/backup/backup-validator.js';
import { requestToPromise } from '../idb-request.js';

const RESTORE_STORES = Object.freeze([...BACKUP_STORE_NAMES, 'device_settings']);

export class IndexedDbBackupRestoreCommand extends BackupRestoreCommandContract {
  constructor({ unitOfWork, inspector, clock, faultInjector = null }) {
    super(); this.unitOfWork = unitOfWork; this.inspector = inspector; this.clock = clock; this.faultInjector = faultInjector;
  }
  async inspectTarget() {
    return this.unitOfWork.run(RESTORE_STORES, 'readonly', ({ store }) => this.inspector.inspect(store));
  }
  checkpoint(name) {
    const result = typeof this.faultInjector === 'function' ? this.faultInjector(name) : this.faultInjector?.checkpoint?.(name);
    if (result && typeof result.then === 'function') throw new Error('Restore fault injector must be synchronous.');
  }
  async restore({ document, expectedFingerprint }) {
    validateBackupRows(document);
    if (document.data.diet_photos.length) throw backupError('BACKUP_MEDIA_UNSUPPORTED');
    try {
      await this.unitOfWork.run(RESTORE_STORES, 'readwrite', async ({ store }) => {
        const target = await this.inspector.inspect(store);
        if (!target.pristine || target.fingerprint !== expectedFingerprint) throw backupError('RESTORE_TARGET_NOT_PRISTINE');
        // Only these three proven-unmodified bootstrap rows may be physically replaced.
        await requestToPromise(store('exercise_templates').delete(target.templateId));
        await requestToPromise(store('exercise_types').delete(target.typeId));
        await requestToPromise(store('profiles').delete(target.profileId));
        this.checkpoint('restore-after-seed-removal');
        for (const name of BACKUP_STORE_NAMES) {
          for (const row of document.data[name]) {
            await requestToPromise(store(name).add(row));
            this.checkpoint(`restore-row:${name}`);
          }
          this.checkpoint(`restore-after:${name}`);
        }
        const deviceStore = store('device_settings');
        const pointer = await requestToPromise(deviceStore.get('current_profile_id'));
        await requestToPromise(deviceStore.put({ ...pointer, value: document.scope.profileId, updated_at: this.clock.nowIso() }));
        this.checkpoint('restore-before-commit');
      });
    } catch (error) {
      if (error.code === 'RESTORE_TARGET_NOT_PRISTINE') throw error;
      throw backupError('RESTORE_TRANSACTION_FAILED', error);
    }
    return { profileId: document.scope.profileId };
  }
}

import { createProfileEntity, createScopedEntity } from '../../../core/entity-metadata.js';
import { BackupRestoreCommandContract } from '../../contracts/backup-restore-command.contract.js';
import { BACKUP_STORE_NAMES, backupError } from '../../../core/backup/backup-format.js';
import { validateBackupRows } from '../../../core/backup/backup-validator.js';
import { requestToPromise } from '../idb-request.js';

const RESTORE_STORES = Object.freeze([...BACKUP_STORE_NAMES, 'device_settings']);

export class IndexedDbBackupRestoreCommand extends BackupRestoreCommandContract {
  constructor({ unitOfWork, inspector, clock, idGenerator, faultInjector = null }) {
    super(); this.unitOfWork = unitOfWork; this.inspector = inspector; this.clock = clock; this.idGenerator = idGenerator; this.faultInjector = faultInjector;
  }
  async inspectTarget() {
    return this.unitOfWork.run(RESTORE_STORES, 'readonly', ({ store }) => this.inspector.inspect(store));
  }
  checkpoint(name) {
    const result = typeof this.faultInjector === 'function' ? this.faultInjector(name) : this.faultInjector?.checkpoint?.(name);
    if (result && typeof result.then === 'function') throw new Error('Restore fault injector must be synchronous.');
  }
  async restore({ document, expectedFingerprint, mode = 'pristine' }) {
    if (!['pristine', 'replace'].includes(mode)) throw backupError('RESTORE_PREVIEW_EXPIRED');
    validateBackupRows(document);
    if (document.data.diet_photos.length) throw backupError('BACKUP_MEDIA_UNSUPPORTED');
    try {
      await this.unitOfWork.run(RESTORE_STORES, 'readwrite', async ({ store }) => {
        const target = await this.inspector.inspect(store);
        if (mode === 'pristine' && !target.pristine) throw backupError('RESTORE_TARGET_NOT_PRISTINE');
        if (target.fingerprint !== expectedFingerprint) throw backupError(mode === 'pristine' ? 'RESTORE_TARGET_NOT_PRISTINE' : 'RESTORE_TARGET_CHANGED');
        if (mode === 'replace') {
          await this.clearPortable(store);
        } else {
        // Only these three proven-unmodified bootstrap rows may be physically replaced.
        await requestToPromise(store('exercise_templates').delete(target.templateId));
        await requestToPromise(store('exercise_types').delete(target.typeId));
        await requestToPromise(store('profiles').delete(target.profileId));
        }
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
        await requestToPromise(deviceStore.put({ ...pointer, key: 'current_profile_id', value: document.scope.profileId, created_at: pointer?.created_at ?? this.clock.nowIso(), updated_at: this.clock.nowIso() }));
        this.checkpoint('restore-before-commit');
      });
    } catch (error) {
      if (['RESTORE_TARGET_NOT_PRISTINE', 'RESTORE_TARGET_CHANGED'].includes(error.code)) throw error;
      throw backupError('RESTORE_TRANSACTION_FAILED', error);
    }
    return { profileId: document.scope.profileId };
  }
  // Explicit reset/replace exception: ordinary CRUD repositories never expose clear.
  async clearPortable(store) {
    for (const name of BACKUP_STORE_NAMES) {
      await requestToPromise(store(name).clear());
      this.checkpoint(`replace-cleared:${name}`);
    }
  }
  async reset({ expectedFingerprint }) {
    try {
      return await this.unitOfWork.run(RESTORE_STORES, 'readwrite', async ({ store }) => {
        const before = await this.inspector.inspect(store);
        if (before.fingerprint !== expectedFingerprint) throw backupError('RESTORE_TARGET_CHANGED');
        await this.clearPortable(store);
        const nowIso = this.clock.nowIso();
        const profile = createProfileEntity({ data: { display_name: '내 프로필', timezone: globalThis.APP_CONFIG.DEFAULT_TIMEZONE, seed_version: globalThis.APP_CONFIG.SEED_VERSION }, id: this.idGenerator.generate(), nowIso });
        const scoped = (data) => createScopedEntity({ data, id: this.idGenerator.generate(), profileId: profile.id, nowIso });
        const type = scoped({ system_key: 'default.pilates', name: '필라테스', icon: '🧘', status: 'active', sort_order: 1 });
        const template = scoped({ exercise_type_id: type.id, version: 1, fields: [{ key: 'duration_minutes', label: '운동시간', type: 'number', unit: '분', required: false, min: 0, step: 1, sort_order: 1 }], status: 'active' });
        for (const [name, row] of [['profiles', profile], ['exercise_types', type], ['exercise_templates', template]]) {
          await requestToPromise(store(name).add(row)); this.checkpoint(`reset-after:${name}`);
        }
        const pointer = await requestToPromise(store('device_settings').get('current_profile_id'));
        await requestToPromise(store('device_settings').put({ ...pointer, key: 'current_profile_id', value: profile.id, created_at: pointer?.created_at ?? nowIso, updated_at: nowIso }));
        this.checkpoint('reset-before-commit');
        const after = await this.inspector.inspect(store);
        if (!after.pristine) throw backupError('RESET_VERIFY_FAILED');
        return { profileId: profile.id };
      });
    } catch (error) {
      if (error.code === 'RESTORE_TARGET_CHANGED') throw error;
      throw backupError('RESET_TRANSACTION_FAILED', error);
    }
  }

}

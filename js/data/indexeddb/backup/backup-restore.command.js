import { validateMedia } from '../../../core/backup/backup-media.js';
import { createProfileEntity, createScopedEntity } from '../../../core/entity-metadata.js';
import { BackupRestoreCommandContract } from '../../contracts/backup-restore-command.contract.js';
import { BACKUP_STORE_NAMES, backupStores, backupError } from '../../../core/backup/backup-format.js';
import { validateBackupRows } from '../../../core/backup/backup-validator.js';
import { requestToPromise } from '../idb-request.js';



export class IndexedDbBackupRestoreCommand extends BackupRestoreCommandContract {
  constructor({ unitOfWork, inspector, clock, idGenerator, faultInjector = null, dbVersion = globalThis.APP_CONFIG.DB_VERSION }) {
    super(); this.names = backupStores(dbVersion >= 3 ? 2 : 1); this.dbVersion = dbVersion; this.stores = [...this.names, 'media_blobs', 'device_settings', ...(dbVersion >= 3 ? ['calendar_outbox'] : [])]; this.unitOfWork = unitOfWork; this.inspector = inspector; this.clock = clock; this.idGenerator = idGenerator; this.faultInjector = faultInjector;
  }
  async inspectTarget() {
    return this.unitOfWork.run(this.stores, 'readonly', ({ store }) => this.inspector.inspect(store));
  }
  checkpoint(name) {
    const result = typeof this.faultInjector === 'function' ? this.faultInjector(name) : this.faultInjector?.checkpoint?.(name);
    if (result && typeof result.then === 'function') throw new Error('Restore fault injector must be synchronous.');
  }
  async restore({ document, expectedFingerprint, mode = 'pristine' }) {
    if (!['pristine', 'replace'].includes(mode)) throw backupError('RESTORE_PREVIEW_EXPIRED');
    validateBackupRows(document);
    if (document.backupVersion === 2) await validateMedia(document, document._media);
    else if (document.data.diet_photos.length) throw backupError('BACKUP_MEDIA_UNSUPPORTED');
    try {
      await this.unitOfWork.run(this.stores, 'readwrite', async ({ store }) => {
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
        await this.disableIntegration(store);
        this.checkpoint('restore-after-seed-removal');
        for (const name of this.names) {
          // Queue a store batch within the same transaction; every failure still aborts all stores.
          await Promise.all((document.data[name] ?? []).map(async (row) => {
            await requestToPromise(store(name).add(row));
            this.checkpoint(`restore-row:${name}`);
          }));
          this.checkpoint(`restore-after:${name}`);
        }
        await Promise.all((document._media ?? []).map(async (row) => { await requestToPromise(store('media_blobs').add(row)); this.checkpoint('restore-media-row'); }));
        this.checkpoint('restore-after-media');
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
  async disableIntegration(store) {
    if (this.dbVersion < 3) return;
    await requestToPromise(store('calendar_outbox').clear());
    const settings = await requestToPromise(store('device_settings').getAll());
    for (const row of settings.filter((r) => r.key.startsWith('google_calendar:'))) await requestToPromise(store('device_settings').put({ ...row, value: { enabled: false }, updated_at: this.clock.nowIso() }));
  }
  async clearPortable(store) {
    await this.disableIntegration(store);
    for (const name of [...this.names, 'media_blobs']) {
      await requestToPromise(store(name).clear());
      this.checkpoint(`replace-cleared:${name}`);
    }
  }
  async reset({ expectedFingerprint }) {
    try {
      return await this.unitOfWork.run(this.stores, 'readwrite', async ({ store }) => {
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

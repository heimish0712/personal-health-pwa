import { decodeBackupV2, validateMedia } from '../core/backup/backup-media.js';
import { BackupValidator } from '../core/backup/backup-validator.js';
import { BackupMigrationRegistry } from '../core/backup/backup-migrations.js';
import { BACKUP_FORMAT, BACKUP_MAX_BYTES, backupError } from '../core/backup/backup-format.js';

export class BackupValidationService {
  constructor({ validator = new BackupValidator(), migrations = new BackupMigrationRegistry() } = {}) {
    this.validator = validator; this.migrations = migrations;
  }
  async validate(document) {
    if (document?.format !== BACKUP_FORMAT) throw backupError('BACKUP_FORMAT_INVALID');
    const { _media, ...portable } = document;
    await this.validator.validate(this.migrations.toCurrent(portable));
    if (portable.backupVersion === 2) await validateMedia(portable, _media);
    return _media ? { ...portable, _media } : portable;
  }
  async readFile(file) {
    if (!file || typeof file.text !== 'function' || !Number.isSafeInteger(file.size) || file.size < 0) throw backupError('BACKUP_JSON_INVALID');
    if (typeof file.slice === 'function' && typeof file.arrayBuffer === 'function' && new Uint8Array(await file.slice(0,2).arrayBuffer()).join(',') === '80,75') return this.validate(await decodeBackupV2(file));
    if (file.size > BACKUP_MAX_BYTES) throw backupError('BACKUP_FILE_TOO_LARGE');
    let document;
    try {
      const content = await file.text();
      if (new TextEncoder().encode(content).length > BACKUP_MAX_BYTES) throw backupError('BACKUP_FILE_TOO_LARGE');
      document = JSON.parse(content);
    } catch (error) {
      if (error.code === 'BACKUP_FILE_TOO_LARGE') throw error;
      throw backupError('BACKUP_JSON_INVALID', error);
    }
    return this.validate(document);
  }
}

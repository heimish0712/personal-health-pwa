import { backupError } from './backup-format.js';

export class BackupMigrationRegistry {
  toCurrent(document) {
    if (document?.backupVersion !== 1) throw backupError('BACKUP_VERSION_UNSUPPORTED');
    return document; // v1 -> v1, no data transformation in v0.4.0.
  }
}

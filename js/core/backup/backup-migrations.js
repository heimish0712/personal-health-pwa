import { backupError } from './backup-format.js';

export class BackupMigrationRegistry {
  toCurrent(document) {
    if (![1, 2].includes(document?.backupVersion)) throw backupError('BACKUP_VERSION_UNSUPPORTED');
    return document; // Portable schema stays v1; preserve original UUID/revision/checksum.
  }
}

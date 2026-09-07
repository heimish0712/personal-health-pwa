import { BACKUP_FORMAT, BACKUP_MAX_BYTES, backupError } from '../core/backup/backup-format.js';
import { canonicalJson } from '../core/backup/canonical-json.js';
import { payloadHash, snapshotPayload } from '../core/backup/backup-integrity.js';

export class BackupExportService {
  constructor({ snapshotReader, validationService, clock }) {
    this.snapshotReader = snapshotReader; this.validationService = validationService; this.clock = clock;
  }
  async exportCurrentProfile() {
    const { profileId, data } = await this.snapshotReader.readCurrentProfile();
    if (data.diet_photos.length) throw backupError('BACKUP_MEDIA_UNSUPPORTED');
    const config = globalThis.APP_CONFIG;
    const document = {
      format: BACKUP_FORMAT, backupVersion: config.BACKUP_FORMAT_VERSION,
      source: { appVersion: config.APP_VERSION, dbVersion: config.DB_VERSION, schemaVersion: config.SCHEMA_VERSION, seedVersion: config.SEED_VERSION },
      exportedAt: this.clock.nowIso(), ...snapshotPayload(profileId, data)
    };
    document.integrity = { algorithm: 'SHA-256', payloadHash: await payloadHash(document) };
    await this.validationService.validate(document);
    const content = canonicalJson(document);
    if (new TextEncoder().encode(content).length > BACKUP_MAX_BYTES) throw backupError('BACKUP_FILE_TOO_LARGE');
    const stamp = document.exportedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return { document, content, filename: `personal-health-backup-v1-${stamp}.json` };
  }
}

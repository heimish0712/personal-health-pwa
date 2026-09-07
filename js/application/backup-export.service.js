import { mediaManifest, encodeBackupV2 } from '../core/backup/backup-media.js';
import { BACKUP_FORMAT, BACKUP_MAX_BYTES, backupError } from '../core/backup/backup-format.js';
import { canonicalJson } from '../core/backup/canonical-json.js';
import { payloadHash, snapshotPayload } from '../core/backup/backup-integrity.js';

export class BackupExportService {
  constructor({ snapshotReader, validationService, clock, coordinator }) {
    this.snapshotReader = snapshotReader; this.validationService = validationService; this.clock = clock; this.coordinator = coordinator;
  }
  exportCurrentProfile(options) { return this.coordinator ? this.coordinator.backup(() => this.#exportSnapshot(options)) : this.#exportSnapshot(options); }
  async #exportSnapshot({ format = 'auto' } = {}) {
    const { profileId, data, media } = await this.snapshotReader.readCurrentProfile({ includeMedia: true });
    const version = format === 'v2' || data.diet_photos.length ? 2 : 1;
    if (data.diet_photos.some((p) => !p.thumbnail_storage_key)) throw backupError('BACKUP_MEDIA_UNSUPPORTED');
    const config = globalThis.APP_CONFIG;
    const document = {
      format: BACKUP_FORMAT, backupVersion: version,
      source: { appVersion: config.APP_VERSION, dbVersion: this.snapshotReader.dbVersion ?? config.DB_VERSION, schemaVersion: data.calendar_event_links ? 2 : 1, seedVersion: config.SEED_VERSION },
      exportedAt: this.clock.nowIso(), ...snapshotPayload(profileId, data)
    };
    document.integrity = { algorithm: 'SHA-256', payloadHash: await payloadHash(document) };
    if (version === 2) document.mediaManifest = mediaManifest(media);
    await this.validationService.validate(version === 2 ? { ...document, _media: media } : document);
    if (version === 2) { const blob = await encodeBackupV2(document, media); return { document, blob, filename: `personal-health-backup-v2-${document.exportedAt.replaceAll(':','-')}.zip` }; }
    const content = canonicalJson(document);
    if (new TextEncoder().encode(content).length > BACKUP_MAX_BYTES) throw backupError('BACKUP_FILE_TOO_LARGE');
    const stamp = document.exportedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return { document, content, filename: `personal-health-backup-v1-${stamp}.json` };
  }
}

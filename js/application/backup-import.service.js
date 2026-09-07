import { BACKUP_STORE_NAMES, backupError } from '../core/backup/backup-format.js';
import { payloadHash, snapshotPayload } from '../core/backup/backup-integrity.js';

export class BackupImportService {
  #inspection = null;
  #generation = 0;
  #busy = false;
  constructor({ validationService, restoreCommand, snapshotReader, identityContext, idGenerator }) {
    this.validationService = validationService; this.restoreCommand = restoreCommand;
    this.snapshotReader = snapshotReader; this.identityContext = identityContext; this.idGenerator = idGenerator;
  }
  discardPreview() { if (!this.#busy) { this.#generation++; this.#inspection = null; } }
  async inspectFile(file) {
    if (this.#busy) throw backupError('RESTORE_BUSY');
    this.discardPreview();
    const generation = this.#generation;
    const document = await this.validationService.readFile(file);
    const target = await this.restoreCommand.inspectTarget();
    if (generation !== this.#generation) throw backupError('RESTORE_PREVIEW_EXPIRED');
    const id = this.idGenerator.generate();
    this.#inspection = { id, document, target };
    return structuredClone({
      id, source: document.source, exportedAt: document.exportedAt,
      profile: document.data.profiles[0], counts: document.counts,
      deletedCounts: Object.fromEntries(BACKUP_STORE_NAMES.map((name) => [name, document.data[name].filter((row) => row.deleted_at !== null).length])),
      pristine: target.pristine
    });
  }
  async restorePreview(id) {
    if (this.#busy) throw backupError('RESTORE_BUSY');
    const inspection = this.#inspection;
    if (!inspection || inspection.id !== id) throw backupError('RESTORE_PREVIEW_EXPIRED');
    if (!inspection.target.pristine) throw backupError('RESTORE_TARGET_NOT_PRISTINE');
    this.#busy = true;
    try {
      const document = await this.validationService.validate(inspection.document);
      await this.restoreCommand.restore({ document, expectedFingerprint: inspection.target.fingerprint });
      this.#inspection = null;
      this.identityContext.setCurrentProfileId(document.scope.profileId);
      try {
        const snapshot = await this.snapshotReader.readCurrentProfile();
        const restored = { ...document, ...snapshotPayload(snapshot.profileId, snapshot.data) };
        await this.validationService.validate(restored);
        if (await payloadHash(restored) !== document.integrity.payloadHash) throw backupError('RESTORE_VERIFY_FAILED');
      } catch (error) { throw backupError('RESTORE_VERIFY_FAILED', error); }
      return { profileId: document.scope.profileId, verifiedHash: document.integrity.payloadHash };
    } finally { this.#busy = false; }
  }
}

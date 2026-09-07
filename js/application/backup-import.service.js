import { canonicalJson } from '../core/backup/canonical-json.js';
import { BACKUP_STORE_NAMES, backupError } from '../core/backup/backup-format.js';
import { payloadHash, snapshotPayload } from '../core/backup/backup-integrity.js';

export class BackupImportService {
  #inspection = null;
  #generation = 0;
  #busy = false;
  #replacement = null;
  constructor({ validationService, restoreCommand, snapshotReader, identityContext, idGenerator, exportService }) {
    this.validationService = validationService; this.restoreCommand = restoreCommand;
    this.snapshotReader = snapshotReader; this.identityContext = identityContext; this.idGenerator = idGenerator; this.exportService = exportService;
  }
  discardPreview() { if (!this.#busy) { this.#generation++; this.#inspection = null; this.#replacement = null; } }
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
  async restorePreview(id) { return this.#restore(id); }
  async #restore(id, { mode = 'pristine', expectedFingerprint } = {}) {
    if (this.#busy) throw backupError('RESTORE_BUSY');
    const inspection = this.#inspection;
    if (!inspection || inspection.id !== id) throw backupError('RESTORE_PREVIEW_EXPIRED');
    if (mode === 'pristine' && !inspection.target.pristine) throw backupError('RESTORE_TARGET_NOT_PRISTINE');
    this.#busy = true;
    try {
      const document = await this.validationService.validate(inspection.document);
      await this.restoreCommand.restore({ document, mode, expectedFingerprint: expectedFingerprint ?? inspection.target.fingerprint });
      this.#inspection = null;
      this.identityContext.setCurrentProfileId(document.scope.profileId);
      try {
        const snapshot = await this.snapshotReader.readCurrentProfile({ includeMedia: document.backupVersion === 2 });
        const restored = { ...document, ...snapshotPayload(snapshot.profileId, snapshot.data), ...(document.backupVersion === 2 ? { _media: snapshot.media } : {}) };
        await this.validationService.validate(restored);
        if (await payloadHash(restored) !== document.integrity.payloadHash) throw backupError('RESTORE_VERIFY_FAILED');
      } catch (error) { throw backupError('RESTORE_VERIFY_FAILED', error); }
      return { profileId: document.scope.profileId, verifiedHash: document.integrity.payloadHash };
    } finally { this.#busy = false; }
  }
  cancelReplacement() { if (!this.#busy) this.#replacement = null; }
  async prepareReplacement({ kind, previewId, backupFirst }) {
    if (this.#busy) throw backupError('RESTORE_BUSY');
    if (!['reset', 'replace'].includes(kind) || typeof backupFirst !== 'boolean') throw backupError('RESTORE_PREVIEW_EXPIRED');
    if (kind === 'replace' && (!this.#inspection || this.#inspection.id !== previewId)) throw backupError('RESTORE_PREVIEW_EXPIRED');
    this.#replacement = null; this.#busy = true;
    try {
      const target = await this.restoreCommand.inspectTarget();
      if (backupFirst && target.profileCount !== 1) throw backupError('BACKUP_MULTIPLE_PROFILES');
      const backup = backupFirst ? await this.exportService.exportCurrentProfile() : null;
      const after = await this.restoreCommand.inspectTarget();
      if (target.fingerprint !== after.fingerprint) throw backupError('RESTORE_TARGET_CHANGED');
      const id = this.idGenerator.generate();
      this.#replacement = { id, kind, previewId, target, backupHash: backup?.document.integrity.payloadHash ?? null, backupMedia: canonicalJson(backup?.document.mediaManifest ?? []), backupFirst };
      return { id, kind, backup };
    } finally { this.#busy = false; }
  }
  async confirmReplacement(id, downloadedFile = null) {
    if (this.#busy) throw backupError('RESTORE_BUSY');
    const pending = this.#replacement;
    if (!pending || pending.id !== id) throw backupError('RESTORE_PREVIEW_EXPIRED');
    this.#busy = true;
    try {
      if (pending.backupFirst) {
        if (!downloadedFile) throw backupError('BACKUP_DOWNLOAD_REQUIRED');
        const saved = await this.validationService.readFile(downloadedFile);
        if (saved.integrity.payloadHash !== pending.backupHash || canonicalJson(saved.mediaManifest ?? []) !== pending.backupMedia) throw backupError('BACKUP_DOWNLOAD_REQUIRED');
      }
      if (pending.kind === 'reset') {
        const result = await this.restoreCommand.reset({ expectedFingerprint: pending.target.fingerprint });
        this.identityContext.setCurrentProfileId(result.profileId);
        this.#inspection = null; this.#replacement = null;
        return result;
      }
      // #restore owns the same busy guard from here; no asynchronous gap before acquiring it.
      this.#busy = false;
      const result = await this.#restore(pending.previewId, { mode: 'replace', expectedFingerprint: pending.target.fingerprint });
      this.#replacement = null; return result;
    } finally { this.#busy = false; }
  }

}

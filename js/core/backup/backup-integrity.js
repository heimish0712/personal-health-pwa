import { canonicalJson } from './canonical-json.js';
import { backupError, backupCounts, sortBackupData } from './backup-format.js';

export async function payloadHash({ scope, counts, data }) {
  if (!globalThis.crypto?.subtle) throw backupError('BACKUP_CRYPTO_UNAVAILABLE');
  const payload = canonicalJson({ scope, counts, data: sortBackupData(data) });
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function snapshotPayload(profileId, data) {
  return { scope: { type: 'profile', profileId }, counts: backupCounts(data), data: sortBackupData(data) };
}

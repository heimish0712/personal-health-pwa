import { backupError } from './backup-format.js';

// Emit keys directly: building an object would reorder integer-like keys again.
export function canonicalJson(value) {
  const ancestors = new Set();
  function encode(item, depth) {
    if (depth > 64) throw backupError('BACKUP_ROW_INVALID');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number' && Number.isFinite(item)) return Object.is(item, -0) ? '-0' : JSON.stringify(item);
    if (!item || typeof item !== 'object' || ancestors.has(item)) throw backupError('BACKUP_ROW_INVALID');
    if (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw backupError('BACKUP_ROW_INVALID');
    if (Object.getOwnPropertySymbols(item).length) throw backupError('BACKUP_ROW_INVALID');
    ancestors.add(item);
    let result;
    if (Array.isArray(item)) {
      if (Object.keys(item).length !== item.length) throw backupError('BACKUP_ROW_INVALID');
      result = `[${Array.from(item, (entry) => encode(entry, depth + 1)).join(',')}]`;
    } else {
      result = `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${encode(item[key], depth + 1)}`).join(',')}}`;
    }
    ancestors.delete(item);
    return result;
  }
  return encode(value, 0);
}

import { isUuid } from '../id-generator.js';
import { canonicalJson } from './canonical-json.js';
import { payloadHash } from './backup-integrity.js';
import { BACKUP_FORMAT, BACKUP_STORE_NAMES, backupError } from './backup-format.js';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const text = (value) => typeof value === 'string';
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
export function isUtcIso(value) {
  if (!text(value) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
}
function assert(condition, code = 'BACKUP_ROW_INVALID') {
  if (!condition) throw backupError(code);
}
function exactKeys(value, keys, code) {
  assert(object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), code);
}

// These are the existing DB v1 unique indexes, not future pass-ledger rules.
export const BACKUP_UNIQUE_KEYS = Object.freeze({
  exercise_types: [['profile_id', 'system_key']],
  exercise_templates: [['profile_id', 'exercise_type_id', 'version']],
  exercise_schedules: [['profile_id', 'completed_exercise_log_id']],
  pass_usage_logs: [['profile_id', 'pass_id', 'exercise_log_id']],
  diet_photos: [['profile_id', 'storage_key']],
  weight_logs: [['profile_id', 'source', 'source_ref_id']],
  user_settings: [['profile_id', 'key']]
});

function validateTemplate(row) {
  assert(positive(row.version) && ['active', 'superseded', 'inactive'].includes(row.status) && Array.isArray(row.fields));
  const keys = new Set();
  for (const field of row.fields) {
    assert(object(field) && text(field.key) && field.key.length > 0 && !keys.has(field.key));
    keys.add(field.key);
    assert(text(field.label) && field.label.length > 0 && (field.unit === undefined || text(field.unit)) && typeof field.required === 'boolean' && finite(field.sort_order));
    assert(['number', 'text', 'textarea', 'boolean', 'select'].includes(field.type));
    for (const key of ['min', 'max', 'step']) if (Object.hasOwn(field, key)) assert(finite(field[key]));
    if (Object.hasOwn(field, 'step')) assert(field.step > 0);
    if (field.min !== undefined && field.max !== undefined) assert(field.min <= field.max);
    if (field.type === 'select') assert(Array.isArray(field.options) && field.options.length > 0 && field.options.every(text) && new Set(field.options).size === field.options.length);
  }
}

function validateValues(log, template) {
  assert(object(log.values) && text(log.memo) && isUtcIso(log.performed_at));
  const definitions = new Map(template.fields.map((field) => [field.key, field]));
  assert(Object.keys(log.values).every((key) => definitions.has(key)));
  for (const field of template.fields) {
    const value = Object.hasOwn(log.values, field.key) ? log.values[field.key] : undefined;
    const empty = value === undefined || value === null || value === '';
    if (empty) { assert(!field.required); continue; }
    if (field.type === 'number') assert(finite(value) && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max));
    else if (field.type === 'boolean') assert(typeof value === 'boolean');
    else if (field.type === 'select') assert(field.options.includes(value));
    else assert(text(value));
  }
}

export function validateBackupRows(document) {
  const { data, scope } = document;
  const maps = {};
  assert(data.profiles.length === 1 && object(data.profiles[0]) && data.profiles[0].id === scope.profileId, 'BACKUP_SCOPE_MISMATCH');
  for (const name of BACKUP_STORE_NAMES) {
    const map = new Map();
    maps[name] = map;
    for (const row of data[name]) {
      assert(object(row) && isUuid(row.id));
      assert(!map.has(row.id), 'BACKUP_DUPLICATE_ID');
      map.set(row.id, row);
      if (name !== 'profiles') assert(row.profile_id === scope.profileId, 'BACKUP_SCOPE_MISMATCH');
      else assert(!Object.hasOwn(row, 'profile_id'), 'BACKUP_SCOPE_MISMATCH');
      assert(positive(row.revision) && isUtcIso(row.created_at) && isUtcIso(row.updated_at));
      assert(Date.parse(row.created_at) <= Date.parse(row.updated_at));
      assert(row.deleted_at === null || isUtcIso(row.deleted_at));
    }
  }
  const profile = data.profiles[0];
  assert(profile.deleted_at === null && text(profile.display_name) && text(profile.timezone) && positive(profile.seed_version));
  try { new Intl.DateTimeFormat('en', { timeZone: profile.timezone }).format(); }
  catch { throw backupError('BACKUP_ROW_INVALID'); }
  // Bootstrap must not upgrade the restored seed and mutate original metadata.
  assert(profile.seed_version >= globalThis.APP_CONFIG.SEED_VERSION, 'BACKUP_SCHEMA_UNSUPPORTED');
  function ref(store, id) {
    const row = maps[store].get(id);
    assert(row, 'BACKUP_REFERENCE_BROKEN');
    return row;
  }
  for (const row of data.exercise_types) {
    assert(text(row.name) && row.name.length > 0 && text(row.icon) && ['active', 'inactive'].includes(row.status) && finite(row.sort_order));
    if (Object.hasOwn(row, 'system_key')) assert(text(row.system_key) && row.system_key.length > 0);
  }
  for (const row of data.exercise_templates) { ref('exercise_types', row.exercise_type_id); validateTemplate(row); }
  for (const row of data.exercise_logs) {
    ref('exercise_types', row.exercise_type_id);
    const template = ref('exercise_templates', row.template_id);
    assert(template.exercise_type_id === row.exercise_type_id, 'BACKUP_REFERENCE_BROKEN');
    validateValues(row, template);
  }
  for (const row of data.exercise_schedules) {
    ref('exercise_types', row.exercise_type_id);
    assert(isUtcIso(row.scheduled_at) && text(row.status));
    if (Object.hasOwn(row, 'completed_exercise_log_id')) assert(ref('exercise_logs', row.completed_exercise_log_id).exercise_type_id === row.exercise_type_id, 'BACKUP_REFERENCE_BROKEN');
  }
  for (const row of data.passes) {
    ref('exercise_types', row.exercise_type_id);
    assert(text(row.name) && Number.isSafeInteger(row.total_count) && row.total_count >= 0 && text(row.status));
  }
  for (const row of data.pass_usage_logs) {
    const pass = ref('passes', row.pass_id);
    const log = ref('exercise_logs', row.exercise_log_id);
    assert(pass.exercise_type_id === log.exercise_type_id, 'BACKUP_REFERENCE_BROKEN');
    assert(positive(row.used_count) && ['used', 'cancelled'].includes(row.status));
  }
  for (const row of data.diet_logs) assert(isUtcIso(row.eaten_at) && text(row.meal_type));
  for (const row of data.diet_photos) ref('diet_logs', row.diet_log_id);
  for (const row of data.weight_logs) {
    assert(isUtcIso(row.measured_at) && finite(row.weight) && row.weight > 0 && text(row.source));
    if (row.source === 'inbody') ref('inbody_logs', row.source_ref_id);
  }
  for (const row of data.inbody_logs) assert(isUtcIso(row.measured_at));
  for (const row of data.user_settings) assert(text(row.key) && row.key.length > 0 && Object.hasOwn(row, 'value'));
  for (const [name, indexes] of Object.entries(BACKUP_UNIQUE_KEYS)) {
    for (const keys of indexes) {
      const seen = new Set();
      for (const row of data[name]) {
        // Missing optional keys do not participate in an IndexedDB index.
        if (keys.some((key) => !Object.hasOwn(row, key))) continue;
        const values = keys.map((key) => row[key]);
        assert(values.every((value) => text(value) || finite(value)));
        const key = canonicalJson(values);
        assert(!seen.has(key), 'BACKUP_UNIQUE_CONFLICT');
        seen.add(key);
      }
    }
  }
}

export class BackupValidator {
  async validate(document) {
    assert(object(document) && document.format === BACKUP_FORMAT, 'BACKUP_FORMAT_INVALID');
    assert(document.backupVersion === 1, 'BACKUP_VERSION_UNSUPPORTED');
    assert(object(document.source) && document.source.schemaVersion === 1, 'BACKUP_SCHEMA_UNSUPPORTED');
    assert(text(document.source.appVersion) && positive(document.source.dbVersion) && positive(document.source.seedVersion));
    assert(isUtcIso(document.exportedAt));
    assert(object(document.scope) && document.scope.type === 'profile' && isUuid(document.scope.profileId), 'BACKUP_SCOPE_MISMATCH');
    exactKeys(document.data, BACKUP_STORE_NAMES, 'BACKUP_FORMAT_INVALID');
    exactKeys(document.counts, BACKUP_STORE_NAMES, 'BACKUP_COUNTS_MISMATCH');
    for (const name of BACKUP_STORE_NAMES) {
      assert(Array.isArray(document.data[name]), 'BACKUP_FORMAT_INVALID');
      assert(Number.isSafeInteger(document.counts[name]) && document.counts[name] === document.data[name].length, 'BACKUP_COUNTS_MISMATCH');
    }
    canonicalJson(document); // reject non-JSON values without silently dropping them
    assert(document.integrity?.algorithm === 'SHA-256' && /^[a-f0-9]{64}$/.test(document.integrity?.payloadHash ?? ''), 'BACKUP_CHECKSUM_MISMATCH');
    assert(await payloadHash(document) === document.integrity.payloadHash, 'BACKUP_CHECKSUM_MISMATCH');
    validateBackupRows(document);
    assert(document.data.diet_photos.length === 0, 'BACKUP_MEDIA_UNSUPPORTED');
    return document;
  }
}

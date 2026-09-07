import { MEAL_TYPES } from '../media-rules.js';
import { HEALTH_METRICS } from '../health-rules.js';
import { isUuid } from '../id-generator.js';
import { canonicalJson } from './canonical-json.js';
import { payloadHash } from './backup-integrity.js';
import { BACKUP_FORMAT, BACKUP_STORE_NAMES, backupStores, backupError } from './backup-format.js';

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
  calendar_event_links: [['profile_id', 'provider', 'schedule_id']],
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
    for (const row of (data[name] ?? [])) {
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
    if (row.pass_id != null) assert(ref('passes', row.pass_id).exercise_type_id === row.exercise_type_id, 'BACKUP_REFERENCE_BROKEN');
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
  const activeUsageIds = new Set();
  for (const row of data.pass_usage_logs) {
    const pass = ref('passes', row.pass_id);
    const log = ref('exercise_logs', row.exercise_log_id);
    assert(pass.exercise_type_id === log.exercise_type_id, 'BACKUP_REFERENCE_BROKEN');
    assert(positive(row.used_count) && ['used', 'cancelled'].includes(row.status));
    if (row.status === 'used' && row.deleted_at === null) {
      assert(log.deleted_at === null && !activeUsageIds.has(log.id), 'BACKUP_REFERENCE_BROKEN');
      activeUsageIds.add(log.id);
    }
  }
  for (const row of data.diet_logs) {
    assert(isUtcIso(row.eaten_at) && text(row.meal_type));
    if (document.backupVersion === 2) {
      assert(Object.hasOwn(MEAL_TYPES, row.meal_type));
      for (const key of ['content','memo']) assert(row[key] == null || (text(row[key]) && row[key].length <= 2000));
    }
  }
  for (const row of data.diet_photos) ref('diet_logs', row.diet_log_id);
  for (const row of data.weight_logs) {
    assert(isUtcIso(row.measured_at) && finite(row.weight) && row.weight > 0 && text(row.source));
    if (row.source === 'inbody') ref('inbody_logs', row.source_ref_id);
  }
  const linkedWeights = new Map(data.weight_logs.filter((r) => r.source === 'inbody').map((r) => [r.source_ref_id, r]));
  for (const row of [...data.weight_logs, ...data.inbody_logs]) assert(row.memo == null || text(row.memo));
  for (const row of data.inbody_logs) {
    assert(isUtcIso(row.measured_at));
    for (const m of HEALTH_METRICS) if (row[m.key] != null) assert(finite(row[m.key]) && (m.positive ? row[m.key] > 0 : row[m.key] >= 0) && (m.max === undefined || row[m.key] <= m.max));
    // v1 legacy backups need no new field. Explicit v0.6 intent enforces both sides.
    if (Object.hasOwn(row, 'link_weight')) {
      assert(typeof row.link_weight === 'boolean');
      const linked = linkedWeights.get(row.id), active = row.link_weight && row.deleted_at === null;
      assert(!row.link_weight || row.weight > 0);
      assert(active ? linked?.deleted_at === null : !linked || linked.deleted_at !== null, 'BACKUP_REFERENCE_BROKEN');
      if (active) assert(linked.weight === row.weight && linked.measured_at === row.measured_at && linked.memo === row.memo, 'BACKUP_REFERENCE_BROKEN');
    }
  }
  for (const row of (data.calendar_event_links ?? [])) {
    ref('exercise_schedules', row.schedule_id);
    assert(row.provider === 'google' && row.calendar_id === 'primary' && ['synced', 'deleted'].includes(row.status));
    assert(row.external_event_id === null || (text(row.external_event_id) && /^[a-v0-9]{5,1024}$/.test(row.external_event_id)));
    assert(positive(row.generation) && isUtcIso(row.last_synced_at));
    const allowed = ['id','profile_id','created_at','updated_at','deleted_at','revision','provider','schedule_id','calendar_id','external_event_id','status','generation','last_synced_at'];
    assert(Object.keys(row).every((key) => allowed.includes(key)));
  }
  for (const row of data.user_settings) assert(text(row.key) && row.key.length > 0 && Object.hasOwn(row, 'value'));
  for (const [name, indexes] of Object.entries(BACKUP_UNIQUE_KEYS)) {
    for (const keys of indexes) {
      const seen = new Set();
      for (const row of (data[name] ?? [])) {
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
    assert([1, 2].includes(document.backupVersion), 'BACKUP_VERSION_UNSUPPORTED');
    assert(object(document.source) && [1, 2].includes(document.source.schemaVersion), 'BACKUP_SCHEMA_UNSUPPORTED');
    assert(text(document.source.appVersion) && positive(document.source.dbVersion) && positive(document.source.seedVersion));
    assert(isUtcIso(document.exportedAt));
    assert(object(document.scope) && document.scope.type === 'profile' && isUuid(document.scope.profileId), 'BACKUP_SCOPE_MISMATCH');
    const names = backupStores(document.source.schemaVersion);
    exactKeys(document.data, names, 'BACKUP_FORMAT_INVALID');
    exactKeys(document.counts, names, 'BACKUP_COUNTS_MISMATCH');
    for (const name of names) {
      assert(Array.isArray(document.data[name]), 'BACKUP_FORMAT_INVALID');
      assert(Number.isSafeInteger(document.counts[name]) && document.counts[name] === document.data[name].length, 'BACKUP_COUNTS_MISMATCH');
    }
    canonicalJson(document); // reject non-JSON values without silently dropping them
    assert(document.integrity?.algorithm === 'SHA-256' && /^[a-f0-9]{64}$/.test(document.integrity?.payloadHash ?? ''), 'BACKUP_CHECKSUM_MISMATCH');
    assert(await payloadHash(document) === document.integrity.payloadHash, 'BACKUP_CHECKSUM_MISMATCH');
    validateBackupRows(document);
    if (document.backupVersion === 1) assert(document.data.diet_photos.length === 0, 'BACKUP_MEDIA_UNSUPPORTED');
    return document;
  }
}

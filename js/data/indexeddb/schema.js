const config = globalThis.APP_CONFIG;

if (!config) {
  throw new Error('APP_CONFIG must be loaded before the IndexedDB schema.');
}

export const DB_NAME = config.DB_NAME;
export const DB_VERSION = config.DB_VERSION;
export const SCHEMA_VERSION = config.SCHEMA_VERSION;

export const STORE_NAMES = Object.freeze({
  PROFILES: 'profiles',
  EXERCISE_TYPES: 'exercise_types',
  EXERCISE_TEMPLATES: 'exercise_templates',
  EXERCISE_LOGS: 'exercise_logs',
  EXERCISE_SCHEDULES: 'exercise_schedules',
  PASSES: 'passes',
  PASS_USAGE_LOGS: 'pass_usage_logs',
  DIET_LOGS: 'diet_logs',
  DIET_PHOTOS: 'diet_photos',
  WEIGHT_LOGS: 'weight_logs',
  INBODY_LOGS: 'inbody_logs',
  USER_SETTINGS: 'user_settings',
  DEVICE_SETTINGS: 'device_settings',
  APP_LOGS: 'app_logs'
});

export const SYNC_STORE_NAMES = Object.freeze([
  STORE_NAMES.PROFILES,
  STORE_NAMES.EXERCISE_TYPES,
  STORE_NAMES.EXERCISE_TEMPLATES,
  STORE_NAMES.EXERCISE_LOGS,
  STORE_NAMES.EXERCISE_SCHEDULES,
  STORE_NAMES.PASSES,
  STORE_NAMES.PASS_USAGE_LOGS,
  STORE_NAMES.DIET_LOGS,
  STORE_NAMES.DIET_PHOTOS,
  STORE_NAMES.WEIGHT_LOGS,
  STORE_NAMES.INBODY_LOGS,
  STORE_NAMES.USER_SETTINGS
]);

export const LOCAL_ONLY_STORE_NAMES = Object.freeze([
  STORE_NAMES.DEVICE_SETTINGS,
  STORE_NAMES.APP_LOGS
]);

const index = (name, keyPath, options = {}) => Object.freeze({ name, keyPath, options });
const store = (keyPath, indexes) => Object.freeze({ keyPath, indexes: Object.freeze(indexes) });

export const STORE_DEFINITIONS = Object.freeze({
  [STORE_NAMES.PROFILES]: store('id', [
    index('by_created_at', 'created_at')
  ]),

  [STORE_NAMES.EXERCISE_TYPES]: store('id', [
    index('by_profile', 'profile_id'),
    index('by_profile_status_sort', ['profile_id', 'status', 'sort_order']),
    index('by_profile_name', ['profile_id', 'name']),
    index('uq_profile_system_key', ['profile_id', 'system_key'], { unique: true })
  ]),

  [STORE_NAMES.EXERCISE_TEMPLATES]: store('id', [
    index('by_profile_exercise', ['profile_id', 'exercise_type_id']),
    index('by_profile_exercise_status', ['profile_id', 'exercise_type_id', 'status']),
    index('uq_profile_exercise_version', ['profile_id', 'exercise_type_id', 'version'], { unique: true })
  ]),

  [STORE_NAMES.EXERCISE_LOGS]: store('id', [
    index('by_profile_performed_at', ['profile_id', 'performed_at']),
    index('by_profile_exercise_performed_at', ['profile_id', 'exercise_type_id', 'performed_at']),
    index('by_profile_template', ['profile_id', 'template_id'])
  ]),

  [STORE_NAMES.EXERCISE_SCHEDULES]: store('id', [
    index('by_profile_scheduled_at', ['profile_id', 'scheduled_at']),
    index('by_profile_status_scheduled_at', ['profile_id', 'status', 'scheduled_at']),
    index('by_profile_exercise_scheduled_at', ['profile_id', 'exercise_type_id', 'scheduled_at']),
    index('uq_profile_completed_log', ['profile_id', 'completed_exercise_log_id'], { unique: true })
  ]),

  [STORE_NAMES.PASSES]: store('id', [
    index('by_profile_exercise', ['profile_id', 'exercise_type_id']),
    index('by_profile_status', ['profile_id', 'status']),
    index('by_profile_expiry', ['profile_id', 'expiry_date'])
  ]),

  [STORE_NAMES.PASS_USAGE_LOGS]: store('id', [
    index('by_profile_pass', ['profile_id', 'pass_id']),
    index('by_profile_pass_status', ['profile_id', 'pass_id', 'status']),
    index('by_profile_exercise_log', ['profile_id', 'exercise_log_id']),
    index('uq_profile_pass_exercise', ['profile_id', 'pass_id', 'exercise_log_id'], { unique: true })
  ]),

  [STORE_NAMES.DIET_LOGS]: store('id', [
    index('by_profile_eaten_at', ['profile_id', 'eaten_at']),
    index('by_profile_meal_eaten_at', ['profile_id', 'meal_type', 'eaten_at'])
  ]),

  [STORE_NAMES.DIET_PHOTOS]: store('id', [
    index('by_profile_diet_sort', ['profile_id', 'diet_log_id', 'sort_order']),
    index('uq_profile_storage_key', ['profile_id', 'storage_key'], { unique: true })
  ]),

  [STORE_NAMES.WEIGHT_LOGS]: store('id', [
    index('by_profile_measured_at', ['profile_id', 'measured_at']),
    index('by_profile_source', ['profile_id', 'source']),
    index('uq_profile_source_ref', ['profile_id', 'source', 'source_ref_id'], { unique: true })
  ]),

  [STORE_NAMES.INBODY_LOGS]: store('id', [
    index('by_profile_measured_at', ['profile_id', 'measured_at'])
  ]),

  [STORE_NAMES.USER_SETTINGS]: store('id', [
    index('uq_profile_key', ['profile_id', 'key'], { unique: true })
  ]),

  [STORE_NAMES.DEVICE_SETTINGS]: store('key', []),

  [STORE_NAMES.APP_LOGS]: store('id', [
    index('by_created_at', 'created_at'),
    index('by_level_created_at', ['level', 'created_at']),
    index('by_event_created_at', ['event', 'created_at'])
  ])
});

export const EXPECTED_STORE_NAMES = Object.freeze(Object.keys(STORE_DEFINITIONS));
export const EXPECTED_STORE_COUNT = EXPECTED_STORE_NAMES.length;

export function getStoreDefinition(storeName) {
  const definition = STORE_DEFINITIONS[storeName];
  if (!definition) throw new Error(`Unknown Object Store: ${storeName}`);
  return definition;
}

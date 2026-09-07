import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { TestReporter } from './test-reporter.mjs';

const root = path.resolve(process.cwd());
const reporter = new TestReporter('schema');
const output = path.join(root, 'tests/results/v0.10.0-schema.json');

await import(pathToFileURL(path.join(root, 'js/config.js')));
const schema = await import(pathToFileURL(path.join(root, 'js/data/indexeddb/schema.js')));

reporter.check('SCHEMA-001', schema.EXPECTED_STORE_COUNT === 17, 'Exactly 17 Object Stores are defined.');
reporter.check('SCHEMA-002', Object.keys(schema.STORE_DEFINITIONS).length === 17, 'Store definition count matches expected count.');
reporter.check('SCHEMA-003', schema.SYNC_STORE_NAMES.length === 13, '13 stores are classified as future sync targets.');
reporter.check('SCHEMA-004', schema.LOCAL_ONLY_STORE_NAMES.length === 4, '4 stores are classified as local-only.');
reporter.check('SCHEMA-005', schema.STORE_DEFINITIONS.profiles.keyPath === 'id', 'Profile keyPath is id.');
reporter.check('SCHEMA-006', schema.STORE_DEFINITIONS.device_settings.keyPath === 'key', 'Device settings keyPath is key.');

const requiredIndexes = {
  exercise_types: ['by_profile', 'by_profile_status_sort', 'by_profile_name', 'uq_profile_system_key'],
  exercise_templates: ['by_profile_exercise', 'by_profile_exercise_status', 'uq_profile_exercise_version'],
  exercise_logs: ['by_profile_performed_at', 'by_profile_exercise_performed_at', 'by_profile_template'],
  exercise_schedules: ['by_profile_scheduled_at', 'by_profile_status_scheduled_at', 'by_profile_exercise_scheduled_at', 'uq_profile_completed_log'],
  passes: ['by_profile_exercise', 'by_profile_status', 'by_profile_expiry'],
  pass_usage_logs: ['by_profile_pass', 'by_profile_pass_status', 'by_profile_exercise_log', 'uq_profile_pass_exercise'],
  diet_logs: ['by_profile_eaten_at', 'by_profile_meal_eaten_at'],
  diet_photos: ['by_profile_diet_sort', 'uq_profile_storage_key'],
  weight_logs: ['by_profile_measured_at', 'by_profile_source', 'uq_profile_source_ref'],
  inbody_logs: ['by_profile_measured_at'],
  user_settings: ['uq_profile_key'],
  app_logs: ['by_created_at', 'by_level_created_at', 'by_event_created_at']
};

for (const [storeName, indexNames] of Object.entries(requiredIndexes)) {
  const actual = new Set(schema.STORE_DEFINITIONS[storeName].indexes.map((item) => item.name));
  for (const indexName of indexNames) {
    reporter.check(`INDEX:${storeName}:${indexName}`, actual.has(indexName), 'Required index is defined.');
  }
}


const requiredUniqueIndexes = [
  ['exercise_types', 'uq_profile_system_key', ['profile_id', 'system_key']],
  ['exercise_templates', 'uq_profile_exercise_version', ['profile_id', 'exercise_type_id', 'version']],
  ['exercise_schedules', 'uq_profile_completed_log', ['profile_id', 'completed_exercise_log_id']],
  ['pass_usage_logs', 'uq_profile_pass_exercise', ['profile_id', 'pass_id', 'exercise_log_id']],
  ['diet_photos', 'uq_profile_storage_key', ['profile_id', 'storage_key']],
  ['weight_logs', 'uq_profile_source_ref', ['profile_id', 'source', 'source_ref_id']],
  ['user_settings', 'uq_profile_key', ['profile_id', 'key']]
];

for (const [storeName, indexName, keyPath] of requiredUniqueIndexes) {
  const definition = schema.STORE_DEFINITIONS[storeName].indexes.find((item) => item.name === indexName);
  reporter.check(
    `INDEX-UNIQUE:${storeName}:${indexName}`,
    Boolean(definition)
      && definition.options.unique === true
      && JSON.stringify(definition.keyPath) === JSON.stringify(keyPath),
    'Unique compound index definition and key path match the approved schema.'
  );
}

for (const [storeName, definition] of Object.entries(schema.STORE_DEFINITIONS)) {
  const uniqueNames = new Set(definition.indexes.map((item) => item.name));
  reporter.check(`INDEX-UNIQUE-NAME:${storeName}`, uniqueNames.size === definition.indexes.length, 'Index names are unique within the store.');
}

reporter.finish(output);

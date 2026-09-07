import fs from 'node:fs';
import assert from 'node:assert/strict';
import '../js/config.js';
import { TestReporter } from './test-reporter.mjs';
import { BACKUP_STORE_NAMES, BACKUP_FORMAT, backupCounts } from '../js/core/backup/backup-format.js';
import { canonicalJson } from '../js/core/backup/canonical-json.js';
import { payloadHash } from '../js/core/backup/backup-integrity.js';
import { BackupValidationService } from '../js/application/backup-validation.service.js';
import { BACKUP_UNIQUE_KEYS } from '../js/core/backup/backup-validator.js';
import { STORE_DEFINITIONS } from '../js/data/indexeddb/schema.js';

const reporter = new TestReporter('backup');
const validator = new BackupValidationService();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-07T00:00:00.000Z';
const metadata = (n) => ({ id: id(n), profile_id: id(1), created_at: time, updated_at: time, deleted_at: null, revision: 1 });
const data = Object.fromEntries(BACKUP_STORE_NAMES.map((name) => [name, []]));
data.profiles = [{ ...metadata(1), display_name: '가상 프로필', timezone: 'Asia/Seoul', seed_version: 1 }];
delete data.profiles[0].profile_id;
data.exercise_types = [{ ...metadata(2), name: '러닝', icon: 'R', status: 'active', sort_order: 1 }];
data.exercise_templates = [{ ...metadata(3), exercise_type_id: id(2), version: 1, status: 'superseded', fields: [{ key: 'duration_minutes', label: '시간', type: 'number', min: 0, required: false, sort_order: 1 }] }];
data.exercise_logs = [{ ...metadata(4), exercise_type_id: id(2), template_id: id(3), performed_at: time, values: { duration_minutes: 10 }, memo: '  원본 메모 <안전>  ', revision: 7, deleted_at: time }];
data.passes = [{ ...metadata(5), exercise_type_id: id(2), name: '테스트권', total_count: 10, status: 'active' }];
data.pass_usage_logs = [{ ...metadata(6), pass_id: id(5), exercise_log_id: id(4), used_count: 1, status: 'cancelled' }];
const original = { format: BACKUP_FORMAT, backupVersion: 1, source: { appVersion: '0.9.0', dbVersion: 1, schemaVersion: 1, seedVersion: 1 }, exportedAt: time, scope: { type: 'profile', profileId: id(1) }, data, counts: backupCounts(data) };
async function seal(doc) { doc.counts = backupCounts(doc.data); doc.integrity = { algorithm: 'SHA-256', payloadHash: await payloadHash(doc) }; return doc; }
await seal(original);
async function reject(id, mutate, code, rehash = true) {
  await reporter.test(id, async () => {
    const doc = structuredClone(original); mutate(doc);
    if (rehash) await seal(doc);
    await assert.rejects(() => validator.validate(doc), (error) => error.code === code);
  }, `Rejects with ${code}, before any database access.`);
}
await reporter.test('BACKUP-VAL-001', async () => { await validator.validate(original); }, 'Valid backup with historical template and deleted record accepted.');
await reporter.test('BACKUP-VAL-002', async () => { await assert.rejects(() => validator.readFile(new Blob(['{'])), (e) => e.code === 'BACKUP_JSON_INVALID'); });
await reject('BACKUP-VAL-003', (d) => { d.format = 'other'; }, 'BACKUP_FORMAT_INVALID');
await reject('BACKUP-VAL-004', (d) => { d.backupVersion = 3; }, 'BACKUP_VERSION_UNSUPPORTED');
await reject('BACKUP-VAL-005', (d) => { d.source.schemaVersion = 2; }, 'BACKUP_SCHEMA_UNSUPPORTED');
await reject('BACKUP-VAL-006', (d) => { d.counts.exercise_logs++; }, 'BACKUP_COUNTS_MISMATCH', false);
await reject('BACKUP-VAL-007', (d) => { d.data.exercise_logs[0].memo = 'changed'; }, 'BACKUP_CHECKSUM_MISMATCH', false);
await reject('BACKUP-VAL-008', (d) => { d.data.exercise_logs.push(structuredClone(d.data.exercise_logs[0])); }, 'BACKUP_DUPLICATE_ID');
await reject('BACKUP-VAL-009', (d) => { d.data.exercise_logs[0].profile_id = id(99); }, 'BACKUP_SCOPE_MISMATCH');
await reject('BACKUP-VAL-010', (d) => { d.data.exercise_templates[0].exercise_type_id = id(99); }, 'BACKUP_REFERENCE_BROKEN');
await reject('BACKUP-VAL-011', (d) => { d.data.exercise_logs[0].template_id = id(99); }, 'BACKUP_REFERENCE_BROKEN');
await reject('BACKUP-VAL-012', (d) => { d.data.exercise_schedules.push({ ...metadata(9), exercise_type_id: id(2), scheduled_at: time, status: 'completed', completed_exercise_log_id: id(99) }); }, 'BACKUP_REFERENCE_BROKEN');
await reject('BACKUP-VAL-013', (d) => { d.data.pass_usage_logs[0].pass_id = id(99); }, 'BACKUP_REFERENCE_BROKEN');
await reject('BACKUP-VAL-014', (d) => { d.data.weight_logs.push({ ...metadata(10), measured_at: time, weight: 65, source: 'inbody', source_ref_id: id(99) }); }, 'BACKUP_REFERENCE_BROKEN');
await reject('BACKUP-VAL-015', (d) => { d.data.exercise_templates.push({ ...structuredClone(d.data.exercise_templates[0]), id: id(99) }); }, 'BACKUP_UNIQUE_CONFLICT');
await reporter.test('BACKUP-FILE-LIMIT', async () => { await assert.rejects(() => validator.readFile({ size: 50000001, text() { throw Error('must not read'); } }), (e) => e.code === 'BACKUP_FILE_TOO_LARGE'); });
await reporter.test('BACKUP-COMPATIBILITY', async () => {
  const doc = structuredClone(original); doc.source.appVersion = '99.9.9'; doc.source.dbVersion = 42;
  await validator.validate(doc);
}, 'App and DB implementation versions are informational, not rejection gates.');
await reporter.test('BACKUP-CANONICAL', async () => {
  const doc = JSON.parse(JSON.stringify(original, null, 4));
  doc.data = Object.fromEntries(Object.entries(doc.data).reverse());
  assert.equal(await payloadHash(doc), original.integrity.payloadHash);
  assert.equal(canonicalJson({ '2': 'b', '10': 'a' }), '{"10":"a","2":"b"}');
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  assert.equal(canonicalJson(JSON.parse(canonicalJson({ value: -0 }))), '{"value":-0}');
});
await reporter.test('BACKUP-UNIQUE-SCHEMA-PARITY', () => {
  const actual = Object.fromEntries(Object.entries(STORE_DEFINITIONS).filter(([, def]) => def.indexes.some((i) => i.options.unique)).map(([name, def]) => [name, def.indexes.filter((i) => i.options.unique).map((i) => i.keyPath)]));
  assert.deepEqual(BACKUP_UNIQUE_KEYS, actual);
}, 'All seven DB v1 unique indexes match the validator.');
for (const [suffix, mutate] of [
  ['TIME', (d) => { d.data.exercise_logs[0].created_at = '2027-01-01T00:00:00.000Z'; }],
  ['REVISION', (d) => { d.data.exercise_logs[0].revision = 0; }],
  ['FIELD', (d) => { d.data.exercise_templates[0].fields[0].step = -1; }]
]) await reject(`BACKUP-INVALID-${suffix}`, mutate, 'BACKUP_ROW_INVALID');
await reporter.test('BACKUP-JSON-LOSS', () => {
  for (const value of [NaN, Infinity, undefined, new Date(), new Blob(['x'])]) assert.throws(() => canonicalJson({ value }));
});
await reject('BACKUP-MALFORMED-ROWS', (d) => { d.data.exercise_logs = [null, {}]; d.data.pass_usage_logs = []; }, 'BACKUP_ROW_INVALID');
await reject('BACKUP-MEDIA-IMPORT', (d) => {
  d.data.diet_logs.push({ ...metadata(20), eaten_at: time, meal_type: 'lunch' });
  d.data.diet_photos.push({ ...metadata(21), diet_log_id: id(20), storage_key: 'synthetic', sort_order: 1 });
}, 'BACKUP_MEDIA_UNSUPPORTED');
await reporter.test('BACKUP-ARCHITECTURE', () => {
  const page = fs.readFileSync('js/pages/settings/backup-restore.page.js', 'utf8');
  assert(!/data\/indexeddb|repositories\.|repositoryProvider/.test(page));
  const command = fs.readFileSync('js/data/indexeddb/backup/backup-restore.command.js', 'utf8');
  assert(!/repositories\.|\.create\(/.test(command));
  assert(command.includes("if (mode === 'replace')") && command.includes('async clearPortable(store)'));
  assert(command.includes(".delete(target.templateId)") && command.includes(".delete(target.typeId)") && command.includes(".delete(target.profileId)"));
});
reporter.finish('tests/results/v0.9.0-backup.json');

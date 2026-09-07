import { BACKUP_STORE_NAMES } from '../../../core/backup/backup-format.js';
import { canonicalJson } from '../../../core/backup/canonical-json.js';
import { isUuid } from '../../../core/id-generator.js';
import { isUtcIso } from '../../../core/backup/backup-validator.js';
import { readPortableStores } from './backup-snapshot.reader.js';
import { requestToPromise } from '../idb-request.js';

export class RestoreTargetInspector {
  async inspect(store) {
    const data = await readPortableStores(store);
    const [pointer, device] = await Promise.all([
      requestToPromise(store('device_settings').get('current_profile_id')),
      requestToPromise(store('device_settings').get('device_id'))
    ]);
    const pristine = this.isPristine(data, pointer, device);
    return {
      pristine,
      // Includes identities and all row values; a stale preview cannot replace a new pristine target.
      fingerprint: canonicalJson({ data, pointer: pointer?.value ?? null, device }),
      profileCount: data.profiles.length,
      profileId: data.profiles[0]?.id ?? null,
      typeId: data.exercise_types[0]?.id ?? null,
      templateId: data.exercise_templates[0]?.id ?? null
    };
  }

  isPristine(data, pointer, device) {
    if (data.profiles.length !== 1 || data.exercise_types.length !== 1 || data.exercise_templates.length !== 1) return false;
    if (BACKUP_STORE_NAMES.filter((name) => !['profiles', 'exercise_types', 'exercise_templates'].includes(name)).some((name) => data[name].length !== 0)) return false;
    const [profile] = data.profiles, [type] = data.exercise_types, [template] = data.exercise_templates;
    if (![profile, type, template].every((row) => isUuid(row.id)) || pointer?.value !== profile.id || !isUuid(device?.value)) return false;
    const time = profile.created_at;
    if (!isUtcIso(time)) return false;
    const metadata = (id, scoped = true) => ({ id, ...(scoped ? { profile_id: profile.id } : {}), created_at: time, updated_at: time, deleted_at: null, revision: 1 });
    const expected = {
      profile: { display_name: '내 프로필', timezone: globalThis.APP_CONFIG.DEFAULT_TIMEZONE, seed_version: 1, ...metadata(profile.id, false) },
      type: { system_key: 'default.pilates', name: '필라테스', icon: '🧘', status: 'active', sort_order: 1, ...metadata(type.id) },
      template: { exercise_type_id: type.id, version: 1, fields: [{ key: 'duration_minutes', label: '운동시간', type: 'number', unit: '분', required: false, min: 0, step: 1, sort_order: 1 }], status: 'active', ...metadata(template.id) }
    };
    return canonicalJson({ profile, type, template }) === canonicalJson(expected);
  }
}

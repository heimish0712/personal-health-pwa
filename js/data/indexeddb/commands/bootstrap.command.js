import { BootstrapCommandContract } from '../../contracts/bootstrap-command.contract.js';
import { createProfileEntity, createScopedEntity } from '../../../core/entity-metadata.js';
import { NotFoundError } from '../../../core/errors.js';
import { requestToPromise } from '../idb-request.js';
import { STORE_NAMES } from '../schema.js';

const DEVICE_ID_KEY = 'device_id';
const CURRENT_PROFILE_ID_KEY = 'current_profile_id';
const DEFAULT_PILATES_SYSTEM_KEY = 'default.pilates';

function makeDeviceSetting(key, value, nowIso, current = null) {
  return {
    key,
    value,
    created_at: current?.created_at ?? nowIso,
    updated_at: nowIso
  };
}

function oldestActiveProfile(profiles) {
  return profiles
    .filter((profile) => profile.deleted_at === null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null;
}

export class IndexedDbBootstrapCommand extends BootstrapCommandContract {
  #unitOfWork;
  #clock;
  #idGenerator;
  #seedVersion;
  #timezone;
  #faultInjector;

  constructor({
    unitOfWork,
    clock,
    idGenerator,
    seedVersion = globalThis.APP_CONFIG.SEED_VERSION,
    timezone = globalThis.APP_CONFIG.DEFAULT_TIMEZONE,
    faultInjector = null
  }) {
    super();
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#seedVersion = seedVersion;
    this.#timezone = timezone;
    this.#faultInjector = faultInjector;
  }

  async initializeDeviceProfileAndSeed() {
    const stores = [
      STORE_NAMES.PROFILES,
      STORE_NAMES.EXERCISE_TYPES,
      STORE_NAMES.EXERCISE_TEMPLATES,
      STORE_NAMES.DEVICE_SETTINGS
    ];

    return this.#unitOfWork.run(stores, 'readwrite', async ({ store }) => {
      const nowIso = this.#clock.nowIso();
      const profileStore = store(STORE_NAMES.PROFILES);
      const exerciseTypeStore = store(STORE_NAMES.EXERCISE_TYPES);
      const templateStore = store(STORE_NAMES.EXERCISE_TEMPLATES);
      const deviceStore = store(STORE_NAMES.DEVICE_SETTINGS);

      let deviceSetting = await requestToPromise(deviceStore.get(DEVICE_ID_KEY));
      let deviceCreated = false;
      if (!deviceSetting) {
        deviceSetting = makeDeviceSetting(DEVICE_ID_KEY, this.#idGenerator.generate(), nowIso);
        await requestToPromise(deviceStore.add(deviceSetting));
        deviceCreated = true;
      }
      this.#checkpoint('after-device');

      const pointer = await requestToPromise(deviceStore.get(CURRENT_PROFILE_ID_KEY));
      let profile = pointer?.value
        ? await requestToPromise(profileStore.get(pointer.value))
        : null;

      let profileCreated = false;
      let profilePointerRepaired = false;
      if (!profile || profile.deleted_at !== null) {
        const profiles = await requestToPromise(profileStore.getAll());
        profile = oldestActiveProfile(profiles);
        profilePointerRepaired = Boolean(pointer);
      }

      if (!profile) {
        profile = createProfileEntity({
          data: {
            display_name: '내 프로필',
            timezone: this.#timezone,
            seed_version: this.#seedVersion
          },
          id: this.#idGenerator.generate(),
          nowIso
        });
        await requestToPromise(profileStore.add(profile));
        profileCreated = true;
      }
      this.#checkpoint('after-profile');

      let seedChanged = false;
      if (profileCreated) {
        await this.#createDefaultPilates({ profile, exerciseTypeStore, templateStore, nowIso });
        seedChanged = true;
      } else if ((profile.seed_version ?? 0) < this.#seedVersion) {
        const result = await this.#upgradeSeedInTransaction({
          profile,
          profileStore,
          exerciseTypeStore,
          templateStore,
          nowIso
        });
        profile = result.profile;
        seedChanged = result.seedChanged;
      }

      const pointerSetting = makeDeviceSetting(
        CURRENT_PROFILE_ID_KEY,
        profile.id,
        nowIso,
        pointer
      );
      await requestToPromise(deviceStore.put(pointerSetting));
      this.#checkpoint('before-commit');

      return {
        profileId: profile.id,
        deviceId: deviceSetting.value,
        deviceCreated,
        profileCreated,
        profilePointerRepaired,
        seedChanged,
        seedVersion: profile.seed_version
      };
    });
  }

  async repairProfilePointer() {
    return this.initializeDeviceProfileAndSeed();
  }

  async upgradeSeed(profileId) {
    return this.#unitOfWork.run([
      STORE_NAMES.PROFILES,
      STORE_NAMES.EXERCISE_TYPES,
      STORE_NAMES.EXERCISE_TEMPLATES
    ], 'readwrite', async ({ store }) => {
      const profileStore = store(STORE_NAMES.PROFILES);
      const profile = await requestToPromise(profileStore.get(profileId));
      if (!profile || profile.deleted_at !== null) {
        throw new NotFoundError('PROFILE_NOT_FOUND', 'Profile was not found for seed upgrade.');
      }

      return this.#upgradeSeedInTransaction({
        profile,
        profileStore,
        exerciseTypeStore: store(STORE_NAMES.EXERCISE_TYPES),
        templateStore: store(STORE_NAMES.EXERCISE_TEMPLATES),
        nowIso: this.#clock.nowIso()
      });
    });
  }

  async #upgradeSeedInTransaction({
    profile,
    profileStore,
    exerciseTypeStore,
    templateStore,
    nowIso
  }) {
    if ((profile.seed_version ?? 0) >= this.#seedVersion) {
      return { profile, seedChanged: false };
    }

    let exerciseType = await requestToPromise(
      exerciseTypeStore.index('uq_profile_system_key').get([profile.id, DEFAULT_PILATES_SYSTEM_KEY])
    );
    let seedChanged = false;

    if (!exerciseType) {
      exerciseType = await this.#createDefaultPilates({
        profile,
        exerciseTypeStore,
        templateStore,
        nowIso
      });
      seedChanged = true;
    } else if (exerciseType.deleted_at === null) {
      const template = await requestToPromise(
        templateStore.index('uq_profile_exercise_version').get([profile.id, exerciseType.id, 1])
      );
      if (!template) {
        await requestToPromise(templateStore.add(this.#makePilatesTemplate(profile.id, exerciseType.id, nowIso)));
        this.#checkpoint('after-template');
        seedChanged = true;
      }
    }

    const nextProfile = {
      ...profile,
      seed_version: this.#seedVersion,
      updated_at: nowIso,
      revision: profile.revision + 1
    };
    await requestToPromise(profileStore.put(nextProfile));
    return { profile: nextProfile, seedChanged };
  }

  async #createDefaultPilates({ profile, exerciseTypeStore, templateStore, nowIso }) {
    const exerciseType = createScopedEntity({
      data: {
        system_key: DEFAULT_PILATES_SYSTEM_KEY,
        name: '필라테스',
        icon: '🧘',
        status: 'active',
        sort_order: 1
      },
      id: this.#idGenerator.generate(),
      profileId: profile.id,
      nowIso
    });
    await requestToPromise(exerciseTypeStore.add(exerciseType));
    this.#checkpoint('after-exercise');

    await requestToPromise(templateStore.add(this.#makePilatesTemplate(profile.id, exerciseType.id, nowIso)));
    this.#checkpoint('after-template');
    return exerciseType;
  }

  #makePilatesTemplate(profileId, exerciseTypeId, nowIso) {
    return createScopedEntity({
      data: {
        exercise_type_id: exerciseTypeId,
        version: 1,
        status: 'active',
        fields: [
          {
            key: 'duration_minutes',
            label: '운동시간',
            type: 'number',
            unit: '분',
            required: false,
            min: 0,
            step: 1,
            sort_order: 1
          }
        ]
      },
      id: this.#idGenerator.generate(),
      profileId,
      nowIso
    });
  }

  #checkpoint(name) {
    if (!this.#faultInjector) return;
    const result = typeof this.#faultInjector === 'function'
      ? this.#faultInjector(name)
      : this.#faultInjector.checkpoint?.(name);
    if (result && typeof result.then === 'function') {
      throw new Error('Bootstrap fault injector must be synchronous inside an IndexedDB transaction.');
    }
  }
}

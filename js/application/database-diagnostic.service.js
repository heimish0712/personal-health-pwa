export class DatabaseDiagnosticService {
  #database;
  #identityContext;
  #profileRepository;
  #deviceSettingsRepository;
  #appLogRepository;
  #expectedStoreNames;
  #schemaVersion;

  constructor({
    database,
    identityContext,
    profileRepository,
    deviceSettingsRepository,
    appLogRepository,
    expectedStoreNames,
    schemaVersion
  }) {
    this.#database = database;
    this.#identityContext = identityContext;
    this.#profileRepository = profileRepository;
    this.#deviceSettingsRepository = deviceSettingsRepository;
    this.#appLogRepository = appLogRepository;
    this.#expectedStoreNames = [...expectedStoreNames];
    this.#schemaVersion = schemaVersion;
  }

  async diagnose() {
    const schema = await this.#database.inspectSchema();
    const currentProfileId = this.#identityContext.getCurrentProfileId();
    const [profile, pointer, recentLogs] = await Promise.all([
      this.#profileRepository.getById(currentProfileId),
      this.#deviceSettingsRepository.get('current_profile_id'),
      this.#appLogRepository.listRecent(20)
    ]);

    const actualStores = new Set(schema.storeNames);
    const missingStores = this.#expectedStoreNames.filter((name) => !actualStores.has(name));
    const recentError = recentLogs.find((log) => log.level === 'ERROR') ?? null;
    const profileConnected = Boolean(profile && pointer?.value === profile.id);

    return {
      status: missingStores.length === 0 && profileConnected && schema.version === globalThis.APP_CONFIG.DB_VERSION && this.#schemaVersion === globalThis.APP_CONFIG.SCHEMA_VERSION ? 'normal' : 'warning',
      databaseName: schema.name,
      databaseVersion: schema.version,
      schemaVersion: this.#schemaVersion,
      actualStoreCount: schema.storeNames.length,
      expectedStoreCount: this.#expectedStoreNames.length,
      missingStores,
      profileConnected,
      profileId: profile?.id ?? null,
      seedVersion: profile?.seed_version ?? null,
      timezone: profile?.timezone ?? null,
      recentError: recentError ? {
        event: recentError.event,
        createdAt: recentError.created_at
      } : null
    };
  }
}

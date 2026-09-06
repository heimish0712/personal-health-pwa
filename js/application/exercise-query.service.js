import { getLocalWeekUtcRange } from '../core/datetime.js';

export class ExerciseQueryService {
  #exerciseTypeRepository;
  #exerciseTemplateRepository;
  #exerciseLogRepository;
  #profileRepository;
  #identityContext;
  #clock;

  constructor({ exerciseTypeRepository, exerciseTemplateRepository, exerciseLogRepository, profileRepository, identityContext, clock }) {
    this.#exerciseTypeRepository = exerciseTypeRepository;
    this.#exerciseTemplateRepository = exerciseTemplateRepository;
    this.#exerciseLogRepository = exerciseLogRepository;
    this.#profileRepository = profileRepository;
    this.#identityContext = identityContext;
    this.#clock = clock;
  }

  async getTimezone() {
    const profile = await this.#profileRepository.getById(this.#identityContext.getCurrentProfileId());
    return profile?.timezone ?? globalThis.APP_CONFIG.DEFAULT_TIMEZONE;
  }

  async listActiveTypes() {
    return this.#exerciseTypeRepository.list({
      predicate: (item) => item.status === 'active',
      sort: (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ko')
    });
  }

  async listAllTypes({ includeDeleted = false } = {}) {
    return this.#exerciseTypeRepository.list({
      includeDeleted,
      sort: (a, b) => (a.deleted_at !== null) - (b.deleted_at !== null)
        || (a.status !== b.status ? (a.status === 'active' ? -1 : 1) : 0)
        || (a.sort_order ?? 0) - (b.sort_order ?? 0)
    });
  }

  async getActiveTemplate(exerciseTypeId) {
    const templates = await this.#exerciseTemplateRepository.list({
      predicate: (item) => item.exercise_type_id === exerciseTypeId && item.status === 'active'
    });
    return templates.length === 1 ? templates[0] : null;
  }

  async listRecentLogs({ exerciseTypeId = null, limit = 20, includeDeleted = false } = {}) {
    const logs = await this.#exerciseLogRepository.list({
      includeDeleted,
      predicate: (item) => !exerciseTypeId || item.exercise_type_id === exerciseTypeId,
      sort: (a, b) => b.performed_at.localeCompare(a.performed_at)
    });
    const limited = logs.slice(0, limit);
    const types = await this.#exerciseTypeRepository.list({ includeDeleted: true });
    const typeMap = new Map(types.map((item) => [item.id, item]));
    return limited.map((log) => ({ log, exerciseType: typeMap.get(log.exercise_type_id) ?? null }));
  }

  async getWeeklySummary({ exerciseTypeId = null } = {}) {
    const timezone = await this.getTimezone();
    const { start, end } = getLocalWeekUtcRange(this.#clock.nowIso(), timezone);
    const logs = await this.#exerciseLogRepository.list({
      predicate: (item) => item.performed_at >= start && item.performed_at < end && (!exerciseTypeId || item.exercise_type_id === exerciseTypeId)
    });
    return {
      count: logs.length,
      durationMinutes: logs.reduce((sum, item) => sum + (Number(item.values?.duration_minutes) || 0), 0),
      start,
      end
    };
  }
}

import { queryIndex } from './scoped-index-query.js';
import { BaseScopedRepository } from './base-scoped.repository.js';
import { STORE_NAMES } from '../schema.js';

export class ExerciseScheduleRepository extends BaseScopedRepository {
  constructor(dependencies) {
    super({ ...dependencies, storeName: STORE_NAMES.EXERCISE_SCHEDULES });
    this.dependencies = dependencies;
  }
  async findByCompletedLog(id) { return (await queryIndex(this.dependencies, this.storeName, 'uq_profile_completed_log', id))[0] ?? null; }
  listByDateRange(start, end, options = {}) { return queryIndex(this.dependencies, this.storeName, 'by_profile_scheduled_at', start, { ...options, end }); }
}

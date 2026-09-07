import { latestMeasurements } from './measurement-query.js';
import { queryIndex } from './scoped-index-query.js';
import { BaseScopedRepository } from './base-scoped.repository.js';
import { STORE_NAMES } from '../schema.js';

export class ExerciseLogRepository extends BaseScopedRepository {
  latest(limit = 1) { return latestMeasurements(this.dependencies, this.storeName, limit, 'by_profile_performed_at'); }
  constructor(dependencies) {
    super({ ...dependencies, storeName: STORE_NAMES.EXERCISE_LOGS });
    this.dependencies = dependencies;
  }
  listByDateRange(start, end, options = {}) { return queryIndex(this.dependencies, this.storeName, 'by_profile_performed_at', start, { ...options, end }); }
}

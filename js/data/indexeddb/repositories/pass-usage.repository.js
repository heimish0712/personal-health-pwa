import { queryIndex } from './scoped-index-query.js';
import { BaseScopedRepository } from './base-scoped.repository.js';
import { STORE_NAMES } from '../schema.js';

export class PassUsageRepository extends BaseScopedRepository {
  constructor(dependencies) {
    super({ ...dependencies, storeName: STORE_NAMES.PASS_USAGE_LOGS });
    this.dependencies = dependencies;
  }
  listByPass(id, options = {}) { return queryIndex(this.dependencies, this.storeName, 'by_profile_pass', id, options); }
  listByLog(id, options = {}) { return queryIndex(this.dependencies, this.storeName, 'by_profile_exercise_log', id, options); }
}

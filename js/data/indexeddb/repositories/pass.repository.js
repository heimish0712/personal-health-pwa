import { queryIndex } from './scoped-index-query.js';
import { BaseScopedRepository } from './base-scoped.repository.js';
import { STORE_NAMES } from '../schema.js';

export class PassRepository extends BaseScopedRepository {
  listActive() { return queryIndex(this.dependencies, this.storeName, 'by_profile_status', 'active'); }
  constructor(dependencies) {
    super({ ...dependencies, storeName: STORE_NAMES.PASSES });
    this.dependencies = dependencies;
  }
  listByExercise(id, options = {}) { return queryIndex(this.dependencies, this.storeName, 'by_profile_exercise', id, options); }
}

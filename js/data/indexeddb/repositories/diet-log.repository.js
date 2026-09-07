import { queryIndex } from './scoped-index-query.js';
import { BaseScopedRepository } from './base-scoped.repository.js';
import { STORE_NAMES } from '../schema.js';

export class DietLogRepository extends BaseScopedRepository {
  constructor(dependencies) {
    super({ ...dependencies, storeName: STORE_NAMES.DIET_LOGS }); this.dependencies = dependencies;
  }
  listByDateRange(start,end,options={}) { return queryIndex(this.dependencies,STORE_NAMES.DIET_LOGS,'by_profile_eaten_at',start,{...options,end}); }
}

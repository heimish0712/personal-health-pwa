import { BaseScopedRepository } from './base-scoped.repository.js';
import { STORE_NAMES } from '../schema.js';
import { measurementRange, latestMeasurements } from './measurement-query.js';

export class InbodyRepository extends BaseScopedRepository {
  constructor(dependencies) { super({ ...dependencies, storeName: STORE_NAMES.INBODY_LOGS }); this.dependencies = dependencies; }
  listByDateRange(start, end, options) { return measurementRange(this.dependencies, STORE_NAMES.INBODY_LOGS, start, end, options); }
  latest(limit = 1) { return latestMeasurements(this.dependencies, STORE_NAMES.INBODY_LOGS, limit); }
}

import { requestToPromise } from '../idb-request.js';
import { BaseScopedRepository } from './base-scoped.repository.js';
import { STORE_NAMES } from '../schema.js';
import { measurementRange, latestMeasurements } from './measurement-query.js';

export class WeightRepository extends BaseScopedRepository {
  constructor(dependencies) { super({ ...dependencies, storeName: STORE_NAMES.WEIGHT_LOGS }); this.dependencies = dependencies; }
  listByDateRange(start, end, options) { return measurementRange(this.dependencies, STORE_NAMES.WEIGHT_LOGS, start, end, options); }
  findByInbody(id) { const { database, identityContext } = this.dependencies; return database.runTransaction(['weight_logs'], 'readonly', ({ store }) => requestToPromise(store('weight_logs').index('uq_profile_source_ref').get([identityContext.getCurrentProfileId(), 'inbody', id]))); }
  latest(limit = 2) { return latestMeasurements(this.dependencies, STORE_NAMES.WEIGHT_LOGS, limit); }
}

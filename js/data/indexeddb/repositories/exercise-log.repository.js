import { latestMeasurements } from './measurement-query.js';
import { queryIndex } from './scoped-index-query.js';
import { BaseScopedRepository } from './base-scoped.repository.js';
import { STORE_NAMES } from '../schema.js';

export class ExerciseLogRepository extends BaseScopedRepository {
  recent({ exerciseTypeId = null, limit = 20, includeDeleted = false } = {}) {
    const {database,identityContext}=this.dependencies, profile=identityContext.getCurrentProfileId();
    const prefix=exerciseTypeId ? [profile,exerciseTypeId] : [profile];
    const index=exerciseTypeId ? 'by_profile_exercise_performed_at' : 'by_profile_performed_at';
    return database.runTransaction([this.storeName], 'readonly', ({store}) => new Promise((resolve,reject) => {
      const rows=[],request=store(this.storeName).index(index).openCursor(IDBKeyRange.bound([...prefix,''],[...prefix,'\uffff']),'prev');
      request.onerror=()=>reject(request.error);request.onsuccess=()=>{const cursor=request.result;if(!cursor || rows.length>=limit)return resolve(rows);if(includeDeleted || cursor.value.deleted_at===null)rows.push(cursor.value);if(rows.length>=limit)return resolve(rows);cursor.continue();};
    }));
  }
  latest(limit = 1) { return latestMeasurements(this.dependencies, this.storeName, limit, 'by_profile_performed_at'); }
  constructor(dependencies) {
    super({ ...dependencies, storeName: STORE_NAMES.EXERCISE_LOGS });
    this.dependencies = dependencies;
  }
  listByDateRange(start, end, options = {}) { return queryIndex(this.dependencies, this.storeName, 'by_profile_performed_at', start, { ...options, end }); }
}

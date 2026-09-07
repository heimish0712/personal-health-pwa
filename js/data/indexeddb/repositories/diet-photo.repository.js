import { requestToPromise } from '../idb-request.js';
import { BaseScopedRepository } from './base-scoped.repository.js';
import { STORE_NAMES } from '../schema.js';

export class DietPhotoRepository extends BaseScopedRepository {
  constructor(dependencies) {
    super({ ...dependencies, storeName: STORE_NAMES.DIET_PHOTOS }); this.dependencies = dependencies;
  }
  listByDiet(id,{includeDeleted=false}={}) { const {database,identityContext}=this.dependencies; const profile=identityContext.getCurrentProfileId(); return database.runTransaction(['diet_photos'],'readonly',async ({store}) => (await requestToPromise(store('diet_photos').index('by_profile_diet_sort').getAll(IDBKeyRange.bound([profile,id,0],[profile,id,Number.MAX_SAFE_INTEGER])))).filter((r) => includeDeleted || r.deleted_at === null)); }
}

import { requestToPromise } from '../idb-request.js';
export function queryIndex({ database, identityContext }, storeName, indexName, key, { includeDeleted = false, end } = {}) {
  const profileId = identityContext.getCurrentProfileId();
  const value = key === undefined ? profileId : [profileId, key];
  const range = end === undefined ? value : IDBKeyRange.bound(value, [profileId, end], false, true);
  return database.runTransaction([storeName], 'readonly', async ({ store }) => {
    const rows = await requestToPromise(store(storeName).index(indexName).getAll(range));
    return rows.filter((row) => includeDeleted || row.deleted_at === null);
  });
}

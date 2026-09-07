import { requestToPromise } from '../idb-request.js';
// Dedicated measurement queries leave generic Repository.list unchanged.
export function measurementRange({ database, identityContext }, name, start = '', end = '\uffff', { includeDeleted = false } = {}) {
  const profile = identityContext.getCurrentProfileId();
  return database.runTransaction([name], 'readonly', async ({ store }) => {
    const rows = await requestToPromise(store(name).index('by_profile_measured_at').getAll(IDBKeyRange.bound([profile, start], [profile, end], false, true)));
    return rows.filter((r) => includeDeleted || r.deleted_at === null);
  });
}
export function latestMeasurements({ database, identityContext }, name, limit, indexName = 'by_profile_measured_at') {
  const profile = identityContext.getCurrentProfileId();
  return database.runTransaction([name], 'readonly', ({ store }) => new Promise((resolve, reject) => {
    const rows = [], req = store(name).index(indexName).openCursor(IDBKeyRange.bound([profile, ''], [profile, '\uffff']), 'prev');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const cursor = req.result; if (!cursor || rows.length === limit) return resolve(rows); if (cursor.value.deleted_at === null) rows.push(cursor.value); if (rows.length === limit) return resolve(rows); cursor.continue(); };
  }));
}

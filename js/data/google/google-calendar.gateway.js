import { eventProperties, eventId } from '../../core/google-calendar.js';
export class GoogleCalendarGateway {
  constructor({ fetcher = globalThis.fetch?.bind(globalThis) } = {}) { this.fetcher = fetcher; }
  async project({ profileId, job, link, event, token, permitted }) {
    const properties = eventProperties(profileId, job.schedule_id);
    const owned = (row) => Object.entries(properties).every(([key, value]) => row.extendedProperties?.private?.[key] === value);
    const call = async (path, method = 'GET', body) => {
      if (!await permitted()) throw new Error('SUPERSEDED');
      const response = await this.fetcher(`https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`, {
        method, headers: { Authorization: `Bearer ${token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
      if (response.status === 401 || response.status === 403) throw new Error('AUTH_REQUIRED');
      if ([404, 410].includes(response.status)) return null;
      if (response.status === 409) return { conflict: true };
      if (!response.ok) throw new Error('REMOTE_FAILED');
      return response.status === 204 ? {} : response.json();
    };
    let found = null;
    if (link?.external_event_id && link.status !== 'deleted') {
      found = await call(`/${encodeURIComponent(link.external_event_id)}`);
      if (found && found.status !== 'cancelled' && !owned(found)) throw new Error('FOREIGN_EVENT');
      if (found?.status === 'cancelled') found = null;
    }
    // Reconcile even when the prior insert response or local acknowledgement was lost.
    const matches = [];
    let page;
    do {
      const query = new URLSearchParams({ showDeleted: 'false', maxResults: '2500', ...(page ? { pageToken: page } : {}) });
      for (const [key, value] of Object.entries(properties)) query.append('privateExtendedProperty', `${key}=${value}`);
      const result = await call(`?${query}`);
      matches.push(...(result?.items ?? []).filter((row) => row.status !== 'cancelled' && owned(row))); page = result?.nextPageToken;
    } while (page);
    if (!found) found = matches[0] ?? null;
    // Clean only exact app/profile/schedule duplicates, never user-created events.
    for (const extra of matches.filter((row) => row.id !== found?.id)) await call(`/${encodeURIComponent(extra.id)}`, 'DELETE');
    if (job.desired === 'absent') {
      if (found) await call(`/${encodeURIComponent(found.id)}`, 'DELETE');
      return { externalId: found?.id ?? link?.external_event_id ?? null, status: 'deleted' };
    }
    if (found) {
      const updated = await call(`/${encodeURIComponent(found.id)}`, 'PATCH', event);
      if (!updated) throw new Error('REMOTE_FAILED');
      return { externalId: found.id, status: 'synced' };
    }
    // Google retains deleted IDs. Advance a deterministic generation if a known ID is a tombstone.
    for (let generation = link?.generation ?? 1; generation < (link?.generation ?? 1) + 20; generation++) {
      const id = eventId(profileId, job.schedule_id, generation);
      const inserted = await call('', 'POST', { ...event, id });
      if (inserted?.conflict) {
        const existing = await call(`/${id}`);
        if (existing?.status === 'cancelled') continue;
        if (!existing || !owned(existing)) throw new Error('FOREIGN_EVENT');
        if (!await call(`/${id}`, 'PATCH', event)) throw new Error('REMOTE_FAILED');
      } else if (!inserted?.id) throw new Error('REMOTE_FAILED');
      return { externalId: inserted?.id ?? id, status: 'synced', generation };
    }
    throw new Error('REMOTE_FAILED');
  }
}

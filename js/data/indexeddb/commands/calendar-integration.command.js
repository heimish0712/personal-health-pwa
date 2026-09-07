import { CalendarIntegrationCommandContract } from '../../contracts/calendar-integration-command.contract.js';
import { requestToPromise as request } from '../idb-request.js';
import { createScopedEntity } from '../../../core/entity-metadata.js';
import { integrationKey, calendarEvent } from '../../../core/google-calendar.js';

const STORES = ['device_settings', 'calendar_outbox', 'calendar_event_links', 'exercise_schedules', 'exercise_types', 'profiles'];
// Invoked inside the same schedule transaction. No network or promises unrelated to IDB.
export async function enqueueCalendar(store, schedule, now) {
  const config = await request(store('device_settings').get(integrationKey(schedule.profile_id)));
  if (!config?.value?.enabled) return;
  const old = await request(store('calendar_outbox').get(schedule.id));
  await request(store('calendar_outbox').put({ id: schedule.id, profile_id: schedule.profile_id,
    schedule_id: schedule.id, version: (old?.version ?? 0) + 1, status: 'pending',
    desired: schedule.status === 'cancelled' || schedule.deleted_at ? 'absent' : 'present',
    updated_at: now, last_error: null }));
}
export class IndexedDbCalendarIntegrationCommand extends CalendarIntegrationCommandContract {
  constructor(dependencies) { super(); Object.assign(this, dependencies); }
  run(mode, work) { return this.unitOfWork.run(STORES, mode, ({ store }) => work(store)); }
  async status(profileId) {
    return this.run('readonly', async (store) => {
      const setting = await request(store('device_settings').get(integrationKey(profileId)));
      const jobs = await request(store('calendar_outbox').index('by_profile').getAll(profileId));
      return { enabled: false, ...setting?.value, pending: jobs.filter((j) => j.status === 'pending').length,
        lastError: jobs.find((j) => j.status === 'pending' && j.last_error)?.last_error ?? null };
    });
  }
  setEnabled(profileId, enabled) {
    return this.run('readwrite', async (store) => {
      const key = integrationKey(profileId), old = await request(store('device_settings').get(key));
      await request(store('device_settings').put({ key, value: { ...old?.value, enabled }, created_at: old?.created_at ?? this.clock.nowIso(), updated_at: this.clock.nowIso() }));
      // OFF keeps links/jobs. Re-enabling refreshes existing pending jobs from current local truth.
      if (enabled) {
        const jobs = await request(store('calendar_outbox').index('by_profile_status').getAll([profileId, 'pending']));
        for (const job of jobs) {
          const schedule = await request(store('exercise_schedules').get(job.schedule_id));
          if (schedule?.profile_id === profileId) await enqueueCalendar(store, schedule, this.clock.nowIso());
        }
      }
    });
  }
  pending(profileId) {
    return this.run('readonly', (store) => request(store('calendar_outbox').index('by_profile_status').getAll([profileId, 'pending'])));
  }
  readJob(profileId, id) {
    return this.run('readonly', async (store) => {
      const enabled = (await request(store('device_settings').get(integrationKey(profileId))))?.value?.enabled;
      const job = await request(store('calendar_outbox').get(id));
      if (!enabled || job?.profile_id !== profileId || job.status !== 'pending') return null;
      const schedule = await request(store('exercise_schedules').get(job.schedule_id));
      if (schedule?.profile_id !== profileId) throw new Error('FOREIGN_EVENT');
      const link = await request(store('calendar_event_links').index('uq_profile_provider_schedule').get([profileId, 'google', schedule.id]));
      const profile = await request(store('profiles').get(profileId));
      const type = await request(store('exercise_types').get(schedule.exercise_type_id));
      if (type?.profile_id !== profileId) throw new Error('FOREIGN_EVENT');
      return { job, link, event: job.desired === 'present' ? calendarEvent(schedule, profile, type) : null };
    });
  }
  acknowledge(profileId, job, externalId, status, generation) {
    return this.run('readwrite', async (store) => {
      const current = await request(store('calendar_outbox').get(job.id));
      if (current?.profile_id !== profileId) return; // Restored/reset data must never be re-enqueued.
      const old = await request(store('calendar_event_links').index('uq_profile_provider_schedule').get([profileId, 'google', job.schedule_id]));
      const now = this.clock.nowIso();
      const fields = { provider: 'google', schedule_id: job.schedule_id, calendar_id: 'primary', external_event_id: externalId,
        status, generation: status === 'deleted' ? (old?.generation ?? 1) + 1 : (generation ?? old?.generation ?? 1), last_synced_at: now };
      const row = old ? { ...old, ...fields, updated_at: now, revision: old.revision + 1 } : createScopedEntity({ data: fields, id: this.idGenerator.generate(), profileId, nowIso: now });
      await request(store('calendar_event_links').put(row));
      if (this.faultInjector) this.faultInjector('calendar-before-ack');
      if (current.version === job.version) await request(store('calendar_outbox').put({ ...current, status: 'done', last_error: null }));
      const key = integrationKey(profileId), setting = await request(store('device_settings').get(key));
      await request(store('device_settings').put({ ...setting, key, value: { ...setting?.value, lastSuccess: now }, updated_at: now, created_at: setting?.created_at ?? now }));
    });
  }
  fail(profileId, job, message) {
    return this.run('readwrite', async (store) => {
      const current = await request(store('calendar_outbox').get(job.id));
      if (current?.profile_id === profileId && current.version === job.version) await request(store('calendar_outbox').put({ ...current, last_error: message }));
    });
  }
}

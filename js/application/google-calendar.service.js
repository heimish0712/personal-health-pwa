import { googleMessage } from '../core/google-calendar.js';
export class GoogleCalendarService {
  connectEpoch = 0;
  constructor({ command, tokenClient, gateway, identityContext, coordinator }) { Object.assign(this, { command, tokenClient, gateway, identityContext, coordinator }); }
  profileId() { return this.identityContext.getCurrentProfileId(); }
  async status() { const profileId = this.profileId(); return { ...await this.command.status(profileId), authorized: this.tokenClient.valid(profileId) }; }
  prepare() { return this.tokenClient.prepare(); }
  async connect(clientId) {
    const epoch = ++this.connectEpoch;
    const profileId = this.profileId();
    await this.tokenClient.authorize(profileId, clientId); // popup invoked before first await
    if (epoch !== this.connectEpoch || this.profileId() !== profileId) { this.tokenClient.clear(); throw new Error('AUTH_REQUIRED'); }
    await this.command.setEnabled(profileId, true);
    return this.retry();
  }
  async disable() { ++this.connectEpoch; this.tokenClient.clear(); await this.command.setEnabled(this.profileId(), false); }
  afterLocalCommit() { void this.retry().catch(() => {}); }
  async retry() {
    const profileId = this.profileId();
    const state = await this.command.status(profileId);
    if (!state.enabled) return;
    if (globalThis.navigator?.onLine === false) throw new Error('OFFLINE');
    if (!this.tokenClient.valid(profileId)) throw new Error('AUTH_REQUIRED');
    if (!this.coordinator.locks) throw new Error('LOCK_UNAVAILABLE');
    // Exclusive against backup/restore/GC and other tabs: remote effects cannot race restore.
    return this.coordinator.collect(async () => {
      const permitted = async () => this.profileId() === profileId && this.tokenClient.valid(profileId) && (await this.command.status(profileId)).enabled;
      for (const initial of await this.command.pending(profileId)) {
        if (!await permitted()) break;
        let work;
        try {
          work = await this.command.readJob(profileId, initial.id);
          if (!work) continue;
          const currentDesired = async () => await permitted() && (await this.command.readJob(profileId, initial.id))?.job.version === work.job.version;
          const result = await this.gateway.project({ profileId, ...work, token: () => this.tokenClient.token(profileId), permitted: currentDesired });
          await this.command.acknowledge(profileId, work.job, result.externalId, result.status, result.generation);
        } catch (error) {
          await this.command.fail(profileId, work?.job ?? initial, googleMessage(error));
          if (error.message === 'AUTH_REQUIRED') { this.tokenClient.clear(); break; }
        }
      }
    });
  }
}

// Semantic boundary: a remote result may acknowledge only the claimed desired revision.
export class CalendarIntegrationCommandContract {
  async status() { throw new Error('Not implemented'); }
  async setEnabled() { throw new Error('Not implemented'); }
  async pending() { throw new Error('Not implemented'); }
  async readJob() { throw new Error('Not implemented'); }
  async fail() { throw new Error('Not implemented'); }
  async acknowledge() { throw new Error('Not implemented'); }
}

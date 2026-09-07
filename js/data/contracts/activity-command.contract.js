// Semantic port: adapters must commit each operation atomically (future RPC boundary).
export class ActivityCommandContract {
  async saveLog() { throw new Error('Not implemented'); }
  async deleteLog() { throw new Error('Not implemented'); }
  async restoreLog() { throw new Error('Not implemented'); }
  async savePass() { throw new Error('Not implemented'); }
  async deletePass() { throw new Error('Not implemented'); }
  async saveSchedule() { throw new Error('Not implemented'); }
  async completeSchedule() { throw new Error('Not implemented'); }
  async undoSchedule() { throw new Error('Not implemented'); }
}

import { diagnoseData } from '../core/data-diagnostic.js';
import { safeLog } from '../core/log-privacy.js';
export class OperationsService {
  constructor({reader,logRepository,coordinator}) { Object.assign(this,{reader,logRepository,coordinator}); }
  storage() { return this.reader.storageEstimate(); }
  async diagnose() { return this.coordinator.backup(async()=>diagnoseData(await this.reader.diagnosticSnapshot())); }
  async logs() { return (await this.logRepository.listRecent(50)).map(safeLog); }
  async exportLogs() { return JSON.stringify({appVersion:globalThis.APP_CONFIG.APP_VERSION,exportedAt:new Date().toISOString(),logs:(await this.logs()).map(({id,...row})=>row)},null,2); }
}

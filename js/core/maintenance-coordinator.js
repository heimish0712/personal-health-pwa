import { ValidationError } from './errors.js';
// Shared backup locks may nest. Exclusive GC never queues behind a backup.
export class MaintenanceCoordinator {
  constructor(name, locks = globalThis.navigator?.locks) { this.name = `health-maintenance:${name}`; this.locks = locks; }
  backup(work) { return this.run('shared', work); }
  collect(work) { if (!this.locks) throw new ValidationError('MAINTENANCE_UNSUPPORTED', '이 환경에서는 안전한 파일 정리를 지원하지 않습니다. 백업은 계속 사용할 수 있습니다.'); return this.run('exclusive', work); }
  run(mode, work) {
    if (!this.locks) return work();
    return this.locks.request(this.name, { mode, ifAvailable: true }, (lock) => {
      if (!lock) throw new ValidationError('MAINTENANCE_BUSY', '백업·복원 또는 파일 정리가 진행 중입니다. 완료 후 다시 실행하세요.');
      return work();
    });
  }
}

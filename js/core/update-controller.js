export class UpdateController {
  constructor({ hasGuard, canLeave, reload, notify }) { Object.assign(this, { hasGuard, canLeave, reload, notify }); this.pending = false; }
  controllerChanged() { this.pending = true; if (this.hasGuard()) this.notify(); else this.reload(); }
  apply(worker) { if (!this.canLeave()) return false; if (this.pending) this.reload(); else worker?.postMessage({ type: 'SKIP_WAITING' }); return true; }
}

export class SystemClock {
  now() {
    return new Date();
  }

  nowIso() {
    return this.now().toISOString();
  }
}

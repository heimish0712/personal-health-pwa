export class DirtyFormGuard {
  #dirty = false;
  #message;

  constructor(message = '작성 중인 내용이 있습니다. 나가시겠습니까?') {
    this.#message = message;
  }

  markDirty() { this.#dirty = true; }
  markClean() { this.#dirty = false; }
  isDirty() { return this.#dirty; }
  canLeave() { return !this.#dirty || window.confirm(this.#message); }
}

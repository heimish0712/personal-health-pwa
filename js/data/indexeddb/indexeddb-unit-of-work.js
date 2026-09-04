export class IndexedDbUnitOfWork {
  #database;

  constructor({ database }) {
    this.#database = database;
  }

  run(storeNames, mode, work) {
    return this.#database.runTransaction(storeNames, mode, work);
  }
}

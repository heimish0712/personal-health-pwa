export class RepositoryProvider {
  #repositories;

  constructor(repositories) {
    this.#repositories = Object.freeze({ ...repositories });
  }

  get(name) {
    const repository = this.#repositories[name];
    if (!repository) throw new Error(`Unknown repository: ${name}`);
    return repository;
  }

  all() {
    return this.#repositories;
  }
}

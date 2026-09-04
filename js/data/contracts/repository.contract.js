export class RepositoryContract {
  async getById(_id) {
    throw new Error('RepositoryContract.getById must be implemented.');
  }

  async getByIdIncludingDeleted(_id) {
    throw new Error('RepositoryContract.getByIdIncludingDeleted must be implemented.');
  }

  async list(_query = {}) {
    throw new Error('RepositoryContract.list must be implemented.');
  }

  async count(_query = {}) {
    throw new Error('RepositoryContract.count must be implemented.');
  }

  async create(_entity) {
    throw new Error('RepositoryContract.create must be implemented.');
  }

  async update(_id, _patch, _expectedRevision) {
    throw new Error('RepositoryContract.update must be implemented.');
  }

  async softDelete(_id, _expectedRevision) {
    throw new Error('RepositoryContract.softDelete must be implemented.');
  }

  async restore(_id, _expectedRevision) {
    throw new Error('RepositoryContract.restore must be implemented.');
  }
}

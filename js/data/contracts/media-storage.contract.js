// Binary storage boundary; future adapter may resolve Supabase Storage keys.
export class MediaStorageContract {
  async read() { throw new Error('Not implemented'); }
  async statistics() { throw new Error('Not implemented'); }
  async collectOrphans() { throw new Error('Not implemented'); }
}

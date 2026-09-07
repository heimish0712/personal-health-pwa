// Atomic semantic boundary, replaceable by a Supabase RPC adapter.
export class InbodyCommandContract {
  async saveInbody() { throw new Error('Not implemented'); }
  async deleteInbody() { throw new Error('Not implemented'); }
  async restoreInbody() { throw new Error('Not implemented'); }
}

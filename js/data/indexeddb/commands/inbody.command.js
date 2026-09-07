import { InbodyCommandContract } from '../../contracts/inbody-command.contract.js';
import { createScopedEntity } from '../../../core/entity-metadata.js';
import { ConflictError, NotFoundError } from '../../../core/errors.js';
import { normalizeHealth, healthRule } from '../../../core/health-rules.js';
import { requestToPromise as request } from '../idb-request.js';

export class IndexedDbInbodyCommand extends InbodyCommandContract {
  constructor(dependencies) { super(); Object.assign(this, dependencies); }
  checkpoint(name) {
    const result = typeof this.faultInjector === 'function' ? this.faultInjector(name) : this.faultInjector?.checkpoint?.(name);
    if (result?.then) throw new Error('Fault injection must be synchronous.');
  }
  execute(operation, { id, data, expectedRevision }) {
    const profileId = this.identityContext.getCurrentProfileId();
    return this.unitOfWork.run(['inbody_logs', 'weight_logs'], 'readwrite', async ({ store }) => {
      const inbodies = store('inbody_logs'), weights = store('weight_logs'), now = this.clock.nowIso();
      const old = id ? await request(inbodies.get(id)) : null;
      if (id && (!old || old.profile_id !== profileId)) throw new NotFoundError('ENTITY_NOT_FOUND', '현재 프로필에서 인바디 기록을 찾을 수 없습니다.');
      if (old && (!Number.isInteger(expectedRevision) || old.revision !== expectedRevision)) throw new ConflictError('REVISION_CONFLICT', '다른 화면에서 변경되었습니다. 새로 열어 다시 시도하세요.');
      healthRule(operation === 'save' || old, '인바디 기록을 선택하세요.');
      healthRule(!old || (operation === 'restore' ? old.deleted_at !== null : old.deleted_at === null), '기록의 삭제 상태가 변경되었습니다. 새로 열어주세요.');
      const linked = old ? await request(weights.index('uq_profile_source_ref').get([profileId, 'inbody', old.id])) : null;
      // Legacy rows have no explicit intent; infer from the existing relationship.
      const intent = old?.link_weight ?? Boolean(linked && (old.deleted_at !== null || linked.deleted_at === null));
      const clean = normalizeHealth(operation === 'save' ? data : { ...old, link_weight: intent }, true);
      const fresh = (values) => createScopedEntity({ data: values, id: this.idGenerator.generate(), profileId, nowIso: now });
      const patch = (row, values) => ({ ...row, ...values, revision: row.revision + 1, updated_at: now });
      const next = old ? patch(old, clean) : fresh(clean);
      next.deleted_at = operation === 'delete' ? now : null;
      await request(inbodies.put(next)); this.checkpoint('inbody-after-record');
      const activeLink = next.link_weight && next.deleted_at === null;
      if (activeLink) {
        const values = { measured_at: next.measured_at, weight: next.weight, memo: next.memo, source: 'inbody', source_ref_id: next.id, deleted_at: null };
        await request(weights.put(linked ? patch(linked, values) : fresh(values)));
      } else if (linked && linked.deleted_at === null) await request(weights.put(patch(linked, { deleted_at: now })));
      this.checkpoint('inbody-after-weight');
      return next;
    });
  }
  saveInbody(args) { return this.execute('save', args); }
  deleteInbody(args) { return this.execute('delete', args); }
  restoreInbody(args) { return this.execute('restore', args); }
}

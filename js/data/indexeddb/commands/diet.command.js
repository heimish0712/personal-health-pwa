import { canonicalJson } from '../../../core/backup/canonical-json.js';
import { DietCommandContract } from '../../contracts/diet-command.contract.js';
import { createScopedEntity } from '../../../core/entity-metadata.js';
import { normalizeDiet, validatePhoto, mediaRule, photoKeys, blobChecksum, safeDietError } from '../../../core/media-rules.js';
import { ConflictError, NotFoundError } from '../../../core/errors.js';
import { requestToPromise as request } from '../idb-request.js';
export class IndexedDbDietCommand extends DietCommandContract {
  constructor(deps) { super(); Object.assign(this, deps); }
  checkpoint(step) { const result = typeof this.faultInjector === 'function' ? this.faultInjector(step) : this.faultInjector?.checkpoint?.(step); if (result?.then) throw new Error('Fault injection must be synchronous'); }
  async execute(operation, { id, data, expectedRevision, keepPhotoIds = [], additions = [] }) {
    const profileId = this.identityContext.getCurrentProfileId();
    // CPU / crypto / Blob reads finish before opening the write transaction.
    const prepared = structuredClone(additions);
    for (const item of prepared) {
      canonicalJson(item.metadata); // Portable metadata must never contain a Blob, including nested fields.
      validatePhoto({ ...item.metadata, sort_order: 0 }); mediaRule(item.media?.length === 2);
      for (let i=0;i<2;i++) { const r = item.media[i]; mediaRule(r.storage_key === photoKeys(item.metadata)[i] && r.blob instanceof Blob && r.blob.size === r.byte_size && await blobChecksum(r.blob) === r.checksum && r.checksum === item.metadata[i ? 'thumbnail_checksum' : 'checksum'] && r.byte_size === item.metadata[i ? 'thumbnail_byte_size' : 'byte_size'] && (i || r.blob.type === item.metadata.mime_type)); }
    }
    try { return await this.unitOfWork.run(['diet_logs','diet_photos','media_blobs'], 'readwrite', async ({ store }) => {
      const now = this.clock.nowIso(), logs = store('diet_logs'), photos = store('diet_photos');
      const old = id ? await request(logs.get(id)) : null;
      if (id && (!old || old.profile_id !== profileId)) throw new NotFoundError('ENTITY_NOT_FOUND','식단을 찾을 수 없습니다.');
      if (old && (!Number.isInteger(expectedRevision) || old.revision !== expectedRevision)) throw new ConflictError('REVISION_CONFLICT','다른 화면에서 변경되었습니다. 다시 열어 주세요.');
      mediaRule(operation === 'save' || old);
      mediaRule(!old || (operation === 'restore' ? old.deleted_at !== null : old.deleted_at === null), '식단 삭제 상태가 바뀌었습니다. 다시 열어 주세요.');
      const existing = old ? await request(photos.index('by_profile_diet_sort').getAll(IDBKeyRange.bound([profileId,id,0],[profileId,id,Number.MAX_SAFE_INTEGER]))) : [];
      const fresh = (values) => createScopedEntity({ data: values, id: this.idGenerator.generate(), profileId, nowIso: now });
      const patch = (row,values) => ({ ...row, ...values, revision:row.revision+1, updated_at:now });
      const log = old ? patch(old, operation === 'save' ? normalizeDiet(data) : {}) : fresh(normalizeDiet(data));
      log.deleted_at = operation === 'delete' ? now : null;
      if (operation === 'save') {
        mediaRule(new Set(keepPhotoIds).size === keepPhotoIds.length && keepPhotoIds.every((key) => existing.some((p) => p.id === key && p.deleted_at === null)), '현재 사진 목록이 변경되었습니다. 다시 열어 주세요.');
        mediaRule(keepPhotoIds.length + prepared.length <= globalThis.APP_CONFIG.MEDIA.MAX_PHOTOS, '사진은 식단마다 최대 12장입니다.');
      }
      await request(logs.put(log)); this.checkpoint('diet-after-log');
      let order = 0;
      for (const photo of existing) {
        if (operation === 'save') {
          if (keepPhotoIds.includes(photo.id)) { for (const key of photoKeys(photo)) mediaRule(await request(store('media_blobs').get(key)), '기존 사진이 없습니다. 저장하지 않았습니다.'); await request(photos.put(patch(photo,{sort_order:order++}))); }
          else if (photo.deleted_at === null) await request(photos.put(patch(photo,{deleted_at:now, removed_from_diet:true})));
        } else if (operation === 'delete' && photo.deleted_at === null) await request(photos.put(patch(photo,{deleted_at:now, removed_from_diet:false})));
        else if (operation === 'restore' && photo.deleted_at !== null && photo.removed_from_diet === false) {
          for (const key of photoKeys(photo)) mediaRule(await request(store('media_blobs').get(key)), '사진 파일이 없어 식단을 복원하지 않았습니다. 정상 백업을 확인하세요.');
          await request(photos.put(patch(photo,{deleted_at:null})));
        }
      }
      if (operation === 'save') for (const item of prepared) {
        const photo = fresh({ ...item.metadata, diet_log_id: log.id, sort_order:order++, removed_from_diet:false });
        await request(photos.add(photo)); this.checkpoint('diet-after-photo');
        for (const binary of item.media) { await request(store('media_blobs').add(binary)); this.checkpoint('diet-after-blob'); }
      }
      this.checkpoint('diet-before-commit'); return log;
    }); } catch (error) { throw safeDietError(error); }
  }
  saveDiet(args) { return this.execute('save',args); }
  deleteDiet(args) { return this.execute('delete',args); }
  restoreDiet(args) { return this.execute('restore',args); }
}

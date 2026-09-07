import { blobChecksum, mediaRule, safeDietError } from '../core/media-rules.js';
export class MediaService {
  constructor({ storage, photoRepository, idGenerator, clock }) { Object.assign(this, { storage, photoRepository, idGenerator, clock }); }
  async prepare(file) {
    const config = globalThis.APP_CONFIG.MEDIA;
    mediaRule(file instanceof Blob && file.size > 0 && file.size <= config.MAX_INPUT_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type), 'JPEG·PNG·WebP 사진(25 MB 이하)을 선택하세요. 지원되지 않는 사진은 JPEG로 변환해 주세요.');
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      mediaRule(bitmap.width * bitmap.height <= config.MAX_PIXELS, '사진 해상도가 너무 큽니다. 작은 사진으로 다시 선택하세요.');
      const encode = async (edge, quality) => {
        const ratio = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        const ctx = canvas.getContext('2d'); mediaRule(ctx, '이 브라우저에서 이미지 처리를 사용할 수 없습니다.');
        ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob || blob.type !== 'image/webp') blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        mediaRule(blob && ['image/webp','image/jpeg'].includes(blob.type), '사진 압축에 실패했습니다. 다른 사진으로 다시 시도하세요.');
        const result = { storage_key: `${this.idGenerator.generate()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, blob, byte_size: blob.size, checksum: await blobChecksum(blob), created_at: this.clock.nowIso(), width: canvas.width, height: canvas.height };
        canvas.width = canvas.height = 0; return result;
      };
      const main = await encode(config.MAX_EDGE, config.QUALITY), thumb = await encode(config.THUMB_EDGE, config.THUMB_QUALITY);
      const metadata = { storage_key: main.storage_key, thumbnail_storage_key: thumb.storage_key, mime_type: main.blob.type, width: main.width, height: main.height, byte_size: main.byte_size, checksum: main.checksum, thumbnail_width: thumb.width, thumbnail_height: thumb.height, thumbnail_byte_size: thumb.byte_size, thumbnail_checksum: thumb.checksum, metadata: { processing_version: 1 } };
      const binary = (r) => ({ storage_key:r.storage_key,blob:r.blob,byte_size:r.byte_size,checksum:r.checksum,created_at:r.created_at });
      return { metadata, media: [binary(main),binary(thumb)] };
    } catch (error) { if (error.code === 'MEDIA_INVALID') throw error; throw new Error('사진을 처리하지 못했습니다. 다른 사진을 선택해 주세요.', { cause: error }); }
    finally { bitmap?.close(); }
  }
  async photoBlob(photoId, thumbnail = true) {
    const photo = await this.photoRepository.getById(photoId); mediaRule(photo, '현재 프로필에서 사진을 찾을 수 없습니다.');
    const row = await this.storage.read(thumbnail ? photo.thumbnail_storage_key : photo.storage_key);
    mediaRule(row?.blob instanceof Blob, '사진 파일이 없습니다. 정상 백업에서 복원해 주세요.'); return row.blob;
  }
  async status() {
    const [media, estimate, persistent] = await Promise.all([this.storage.statistics(), navigator.storage?.estimate?.().catch(() => null), navigator.storage?.persisted?.().catch(() => false)]);
    return { ...media, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, supported: Boolean(navigator.storage && globalThis.isSecureContext), persistent: Boolean(persistent) };
  }
  requestPersistence() { return navigator.storage?.persist?.() ?? Promise.resolve(false); }
  collectOrphans() { return this.storage.collectOrphans(); }
}

import { ValidationError } from './errors.js';
export const MEAL_TYPES = Object.freeze({ breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식', other: '기타' });
export function mediaRule(ok, message = '사진 파일 또는 연결 정보를 확인하세요.') { if (!ok) throw new ValidationError('MEDIA_INVALID', message); }
export async function blobChecksum(blob) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), (b) => b.toString(16).padStart(2, '0')).join(''); }
export const validStorageKey = (key) => typeof key === 'string' && /^[a-f0-9-]{36}\.(webp|jpg)$/.test(key);
export function normalizeDiet(data) {
  mediaRule(data && typeof data.eaten_at === 'string' && Number.isFinite(Date.parse(data.eaten_at)) && new Date(data.eaten_at).toISOString() === data.eaten_at, '식사 날짜와 시간을 확인하세요.');
  mediaRule(Object.hasOwn(MEAL_TYPES, data.meal_type), '식사 구분을 선택하세요.');
  for (const key of ['content', 'memo']) mediaRule(data[key] == null || (typeof data[key] === 'string' && data[key].length <= 2000), '내용과 메모는 2000자 이하로 입력하세요.');
  return { eaten_at: data.eaten_at, meal_type: data.meal_type, content: data.content ?? '', memo: data.memo ?? '' };
}
export function photoKeys(photo) { return [photo.storage_key, photo.thumbnail_storage_key]; }
export function validatePhoto(photo) {
  mediaRule(photoKeys(photo).every(validStorageKey) && photo.storage_key !== photo.thumbnail_storage_key);
  mediaRule(['image/webp', 'image/jpeg'].includes(photo.mime_type));
  for (const key of ['width','height','byte_size','thumbnail_width','thumbnail_height','thumbnail_byte_size']) mediaRule(Number.isSafeInteger(photo[key]) && photo[key] > 0);
  mediaRule(Math.max(photo.width, photo.height) <= 1280 && Math.max(photo.thumbnail_width, photo.thumbnail_height) <= 320);
  mediaRule(/^[a-f0-9]{64}$/.test(photo.checksum) && /^[a-f0-9]{64}$/.test(photo.thumbnail_checksum));
  mediaRule(Number.isSafeInteger(photo.sort_order) && photo.sort_order >= 0);
}
export function safeDietError(error) {
  for (let e = error; e; e = e.cause) if (e.name === 'QuotaExceededError') return new ValidationError('MEDIA_QUOTA', '저장공간이 부족합니다. 기존 데이터는 유지됩니다. 사진 수나 용량을 줄여 다시 저장하세요.');
  return error;
}

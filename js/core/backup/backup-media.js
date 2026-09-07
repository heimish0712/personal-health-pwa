import { blobChecksum, validatePhoto, photoKeys, validStorageKey } from '../media-rules.js';
import { backupError } from './backup-format.js';
import { isUtcIso } from './backup-validator.js';
import { canonicalJson } from './canonical-json.js';
import { readZip, writeZip } from './zip-store.js';
const fail = (ok) => { if (!ok) throw backupError('BACKUP_MEDIA_INVALID'); };
export function mediaManifest(rows) { return rows.map(({ storage_key, byte_size, checksum, created_at, blob }) => ({storage_key,byte_size,checksum,created_at,mime_type:blob.type})).sort((a,b)=>a.storage_key.localeCompare(b.storage_key)); }
export async function validateMedia(document, rows) {
  fail(Array.isArray(rows) && Array.isArray(document.mediaManifest));
  const map=new Map();
  for(const row of rows) {
    fail(validStorageKey(row.storage_key) && !map.has(row.storage_key) && row.blob instanceof Blob && ['image/webp','image/jpeg'].includes(row.blob.type) && row.byte_size===row.blob.size && row.byte_size>0 && isUtcIso(row.created_at));
    fail(row.checksum===await blobChecksum(row.blob));map.set(row.storage_key,row);
  }
  fail(canonicalJson(mediaManifest(rows))===canonicalJson(document.mediaManifest));
  const used=new Set(), diets=new Map(document.data.diet_logs.map((r)=>[r.id,r]));
  for(const photo of document.data.diet_photos) {
    const diet=diets.get(photo.diet_log_id);fail(diet && (photo.deleted_at !== null || diet.deleted_at === null));
    fail(photo.removed_from_diet === undefined || typeof photo.removed_from_diet === 'boolean');
    try { validatePhoto(photo); } catch { throw backupError('BACKUP_MEDIA_INVALID'); }
    for(let i=0;i<2;i++) {
      const key=photoKeys(photo)[i],row=map.get(key);fail(row && !used.has(key));used.add(key);
      fail(row.checksum===photo[i?'thumbnail_checksum':'checksum'] && row.byte_size===photo[i?'thumbnail_byte_size':'byte_size']);
      if(!i) fail(row.blob.type===photo.mime_type);
      fail(key.endsWith(row.blob.type==='image/webp'?'.webp':'.jpg'));
    }
  }
  fail(used.size===rows.length);return rows;
}
export async function encodeBackupV2(document, rows) {
  await validateMedia(document,rows);
  const data=new TextEncoder().encode(canonicalJson(document));
  const manifest={format:'personal-health-pwa-backup-zip',backupVersion:2,dataFile:'data.json',jsonChecksum:await blobChecksum(new Blob([data])),mediaCount:rows.length,totalMediaBytes:rows.reduce((n,r)=>n+r.byte_size,0)};
  const entries=new Map([['manifest.json',new TextEncoder().encode(canonicalJson(manifest))],['data.json',data]]);
  for(const row of [...rows].sort((a,b)=>a.storage_key.localeCompare(b.storage_key))) entries.set(`media/${row.storage_key}`,new Uint8Array(await row.blob.arrayBuffer()));
  return writeZip(entries);
}
export async function decodeBackupV2(file) {
  try {
    const entries=await readZip(file),decoder=new TextDecoder('utf-8',{fatal:true});
    fail(entries.has('manifest.json') && entries.has('data.json'));
    const manifest=JSON.parse(decoder.decode(entries.get('manifest.json')));
    fail(manifest.format==='personal-health-pwa-backup-zip' && manifest.backupVersion===2 && manifest.dataFile==='data.json');
    fail(manifest.jsonChecksum===await blobChecksum(new Blob([entries.get('data.json')])));
    const document=JSON.parse(decoder.decode(entries.get('data.json')));fail(document.backupVersion===2 && Array.isArray(document.mediaManifest));
    const rows=document.mediaManifest.map((m)=>{ const bytes=entries.get(`media/${m.storage_key}`);fail(bytes);return {storage_key:m.storage_key,byte_size:m.byte_size,checksum:m.checksum,created_at:m.created_at,blob:new Blob([bytes],{type:m.mime_type})}; });
    fail(entries.size===rows.length+2 && manifest.mediaCount===rows.length && manifest.totalMediaBytes===rows.reduce((n,r)=>n+r.byte_size,0));
    await validateMedia(document,rows);return {...document,_media:rows};
  } catch(error) { if(error.code?.startsWith('BACKUP_')) throw error;throw backupError('BACKUP_ZIP_INVALID',error); }
}

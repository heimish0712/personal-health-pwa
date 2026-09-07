import { backupError } from './backup-format.js';
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal:true });
const MAX = 250000000;
const table = Array.from({length:256},(_,n) => { for(let i=0;i<8;i++) n = n&1 ? 0xedb88320 ^ (n>>>1) : n>>>1; return n>>>0; });
export function crc32(bytes) { let crc=0xffffffff; for(const b of bytes) crc=table[(crc^b)&255]^(crc>>>8); return (crc^0xffffffff)>>>0; }
function requireZip(ok) { if(!ok) throw backupError('BACKUP_ZIP_INVALID'); }
function header(size) { const bytes=new Uint8Array(size);return [bytes,new DataView(bytes.buffer)]; }
export function writeZip(entries) {
  const chunks=[],central=[];let offset=0;
  for(const [name,bytes] of entries) {
    const key=encoder.encode(name),crc=crc32(bytes),[local,v]=header(30);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,key.length,true);
    chunks.push(local,key,bytes);
    const [c,d]=header(46);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,crc,true);d.setUint32(20,bytes.length,true);d.setUint32(24,bytes.length,true);d.setUint16(28,key.length,true);d.setUint32(42,offset,true);central.push(c,key);offset+=30+key.length+bytes.length;
  }
  const size=central.reduce((n,b)=>n+b.length,0),[end,v]=header(22);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.size,true);v.setUint16(10,entries.size,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
  requireZip(offset+size+22<=MAX && entries.size<65535);return new Blob([...chunks,...central,end],{type:'application/zip'});
}
// Deliberately supports the app's STORE ZIP format only: no executable codec/CDN,
// no ZIP64/encryption/deflate bombs or filesystem extraction.
export async function readZip(file) {
  requireZip(file.size>=22 && file.size<=MAX);
  const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer),end=bytes.length-22;
  requireZip(v.getUint32(end,true)===0x06054b50 && v.getUint16(end+4,true)===0 && v.getUint16(end+6,true)===0 && v.getUint16(end+20,true)===0);
  const count=v.getUint16(end+10,true),start=v.getUint32(end+16,true),size=v.getUint32(end+12,true);
  requireZip(count===v.getUint16(end+8,true) && count>=2 && count<=10002 && start+size===end);
  const result=new Map();let pos=start,localEnd=0,total=0;
  for(let i=0;i<count;i++) {
    requireZip(pos+46<=end && v.getUint32(pos,true)===0x02014b50);
    const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),crc=v.getUint32(pos+16,true),compressed=v.getUint32(pos+20,true),length=v.getUint32(pos+24,true),n=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),offset=v.getUint32(pos+42,true);
    requireZip((flags===0 || flags===0x800) && method===0 && compressed===length && pos+46+n+extra+comment<=end && offset===localEnd && offset+30<=start);
    const name=decoder.decode(bytes.slice(pos+46,pos+46+n));requireZip(/^(manifest\.json|data\.json|media\/[a-f0-9-]{36}\.(webp|jpg))$/.test(name) && !result.has(name));
    requireZip(v.getUint32(offset,true)===0x04034b50 && v.getUint16(offset+6,true)===flags && v.getUint16(offset+8,true)===method && v.getUint32(offset+14,true)===crc && v.getUint32(offset+18,true)===length && v.getUint32(offset+22,true)===length);
    const ln=v.getUint16(offset+26,true),le=v.getUint16(offset+28,true),begin=offset+30+ln+le;requireZip(begin+length<=start && decoder.decode(bytes.slice(offset+30,offset+30+ln))===name);
    total+=length;requireZip(total<=MAX);const content=bytes.slice(begin,begin+length);requireZip(crc32(content)===crc);result.set(name,content);localEnd=begin+length;pos+=46+n+extra+comment;
  }
  requireZip(pos===end && localEnd===start);return result;
}

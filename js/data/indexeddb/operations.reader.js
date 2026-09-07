import { OperationsReaderContract } from '../contracts/operations-reader.contract.js';
import { BACKUP_STORE_NAMES } from '../../core/backup/backup-format.js';
import { requestToPromise } from './idb-request.js';
export class IndexedDbOperationsReader extends OperationsReaderContract {
  constructor({database}) { super(); this.database=database; }
  storageEstimate() {
    return this.database.runTransaction(BACKUP_STORE_NAMES,'readonly',async({store})=>{
      const sizes=await Promise.all(BACKUP_STORE_NAMES.map((name)=>new Promise((resolve,reject)=>{
        let bytes=0,count=0;const req=store(name).openCursor();req.onerror=()=>reject(req.error);
        req.onsuccess=()=>{const cursor=req.result;if(!cursor)return resolve({store:name,bytes,count});bytes+=new TextEncoder().encode(JSON.stringify(cursor.value)).length;count++;cursor.continue();};
      })));
      return {portableBytes:sizes.reduce((n,s)=>n+s.bytes,0),portableCount:sizes.reduce((n,s)=>n+s.count,0)};
    });
  }
  diagnosticSnapshot() {
    return this.database.runTransaction([...BACKUP_STORE_NAMES,'media_blobs','device_settings'],'readonly',async({store})=>{
      const data=Object.fromEntries(await Promise.all(BACKUP_STORE_NAMES.map(async(name)=>[name,await requestToPromise(store(name).getAll())])));
      const mediaKeys=await requestToPromise(store('media_blobs').getAllKeys());
      const pointer=await requestToPromise(store('device_settings').get('current_profile_id'));
      return {data,mediaKeys,currentProfileId:pointer?.value};
    });
  }
}

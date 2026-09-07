import { createContainer } from '../../js/bootstrap/container.js';
import { IndexedDbDatabase } from '../../js/data/indexeddb/database.js';
import { applyMigrations } from '../../js/data/indexeddb/migrations.js';
import { canonicalJson } from '../../js/core/backup/canonical-json.js';
import { requestToPromise as request } from '../../js/data/indexeddb/idb-request.js';
import { payloadHash } from '../../js/core/backup/backup-integrity.js';
import { blobChecksum } from '../../js/core/media-rules.js';
import { readZip, writeZip } from '../../js/core/backup/zip-store.js';
import { renderDietList, renderDietDetail, releaseDietUrls } from '../../js/pages/diet/diet.page.js';

export async function runDietTests(test) {
  const containers=[],names=new Set();let failure=null,quota=false;
  const make=async(label,dbVersion=globalThis.APP_CONFIG.DB_VERSION,dbName=`personal-health-pwa-test-diet-${label}-${crypto.randomUUID()}`)=>{const c=createContainer({dbName,dbVersion,faultInjector(step){if(step===failure){if(quota)throw new DOMException('sensitive storage path','QuotaExceededError');throw new Error('diet injected failure');}}});containers.push(c);names.add(dbName);await c.database.open();await c.bootstrapService.initialize();return c;};
  const reject=async(work,code)=>{try{await work();return false;}catch(error){return !code||error.code===code;}};
  const equal=(a,b)=>canonicalJson(a)===canonicalJson(b);
  const binaries=(c)=>c.database.runTransaction(['media_blobs'],'readonly',({store})=>request(store('media_blobs').getAll()));
  const state=async(c)=>({portable:await c.backupSnapshotReader.readCurrentProfile(),media:await Promise.all((await binaries(c)).map(async({blob,...r})=>({...r,actualHash:await blobChecksum(blob)})))});
  const photoFile=async(color='#dd8844',width=1800,height=900)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,width,height);ctx.fillStyle='#fff';ctx.fillRect(0,0,width/4,height/2);return new Promise((resolve)=>canvas.toBlob(resolve,'image/jpeg',.95));};
  const input={eaten_at_local:'2026-09-07T12:10',meal_type:'lunch',content:'밥, 채소, 계란',memo:'QA 식단 <메모>'};
  const root=document.createElement('div');document.body.append(root);
  try {
    // Real DB1 fixture exercises historical templates, ledger, reservations and linked weight.
    const legacy=await make('migration',1),type=(await legacy.exerciseQueryService.listActiveTypes())[0];
    const pass=await legacy.passScheduleService.savePass({exercise_type_id:type.id,name:'이전권',total_count:60,start_date:'2026-01-01',expiry_date:'2026-12-31',status:'active'});
    await legacy.exerciseLogService.create({exercise_type_id:type.id,performed_at_local:'2026-09-07T10:00',values:{duration_minutes:50},memo:'이전운동',pass_id:pass.id});
    await legacy.passScheduleService.saveSchedule({exercise_type_id:type.id,scheduled_at_local:'2026-09-08T10:00',expected_duration_minutes:50,status:'scheduled',memo:'이전예약'});
    await legacy.healthService.saveInbody({measured_at_local:'2026-09-07T08:00',weight:70,link_weight:true,memo:'이전체중'});
    const oldWeight=await legacy.healthService.saveWeight({measured_at_local:'2026-09-06T08:00',weight:71});await legacy.healthService.deleteWeight(oldWeight.id,oldWeight.revision);
    const legacyTemplate=(await legacy.repositories.exerciseTemplate.list()).find(r=>r.exercise_type_id===type.id);
    await legacy.exerciseManagementService.createTemplateVersion(type.id,[{key:'duration_minutes'},{key:'distance_km'}],{expectedTemplateId:legacyTemplate.id,expectedTemplateRevision:legacyTemplate.revision});
    const before=await legacy.backupSnapshotReader.readCurrentProfile(),device=await legacy.repositories.deviceSettings.get('device_id');
    await test('DIET-MIG-01',async()=>{const schema=await legacy.database.inspectSchema();return schema.version===1&&schema.storeNames.length===14&&!schema.storeNames.includes('media_blobs');},'Legacy DB1 contains exact original 14 stores before upgrade.');
    legacy.database.close();
    const failing=new IndexedDbDatabase({name:legacy.database.name,version:2,migrate(args){applyMigrations(args);throw new Error('upgrade failure');}});
    await test('DIET-MIG-02',()=>reject(()=>failing.open(),'DB_MIGRATION_FAILED'),'Injected upgrade aborts without deleting user database.');failing.close();
    const unchanged=await make('unchanged',1,legacy.database.name);
    await test('DIET-MIG-03',async()=>equal(before,await unchanged.backupSnapshotReader.readCurrentProfile())&&(await unchanged.database.inspectSchema()).version===1,'Failed upgrade preserves all v0.6 UUID/revision/relation/tombstones.');unchanged.database.close();
    const upgraded=await make('upgraded',2,legacy.database.name);
    await test('DIET-MIG-04',async()=>equal(before,await upgraded.backupSnapshotReader.readCurrentProfile())&&equal(device,await upgraded.repositories.deviceSettings.get('device_id'))&&(await upgraded.database.inspectSchema()).storeNames.length===15&&(await binaries(upgraded)).length===0,'Successful 1→2 adds only media_blobs; all portable data and device identity unchanged.');
    const c=await make('main'),diet=c.dietService,media=c.mediaService;
    let log=await diet.save(input);
    await test('DIET-01-CRUD',()=>log.revision===1&&log.content===input.content&&log.memo===input.memo&&log.eaten_at==='2026-09-07T03:10:00.000Z','Diet create has scoped UUID/revision and UTC time.');
    log=await diet.save({...input,memo:'수정메모'},log.id,log.revision);
    await test('DIET-02-EDIT',()=>log.revision===2&&log.memo==='수정메모','Memo edit increments revision.');
    await diet.save(input);
    await test('DIET-03-SAME-MEAL',async()=>(await diet.day('2026-09-07')).length===2,'Multiple same-date/same-meal records allowed.');
    await test('DIET-04-STALE',()=>reject(()=>diet.save(input,log.id,1),'REVISION_CONFLICT'),'Stale revision rejected.');
    const file=await photoFile(),prepared=await media.prepare(file);
    await test('DIET-22-WEBP-FALLBACK',async()=>{
      const original=HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){return original.call(this,callback,type==='image/webp'?'image/png':type,quality);};
      try{const p=await media.prepare(file);return p.media.every(r=>r.blob.type==='image/jpeg'&&r.storage_key.endsWith('.jpg'))&&p.metadata.width===1280;}finally{HTMLCanvasElement.prototype.toBlob=original;}
    },'Unsupported WebP output falls back to resized/re-encoded JPEG, never original file.');
    await test('DIET-23-ORIENTATION',async()=>{
      // Insert a little-endian TIFF EXIF orientation=6 into a JPEG. Browser decoding
      // must rotate the 1800x900 source before resizing: portrait 640x1280.
      const raw=new Uint8Array(await file.arrayBuffer());
      const exif=new Uint8Array([0xff,0xe1,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
      const p=await media.prepare(new Blob([raw.slice(0,2),exif,raw.slice(2)],{type:'image/jpeg'}));return p.metadata.width===640&&p.metadata.height===1280&&p.metadata.thumbnail_width===160&&p.metadata.thumbnail_height===320;
    },'EXIF rotation is normalized before main and thumbnail resizing.');
    await test('DIET-05-PROCESS',()=>prepared.metadata.width===1280&&prepared.metadata.height===640&&prepared.metadata.thumbnail_width===320&&prepared.metadata.thumbnail_height===160&&prepared.media.every((r)=>r.blob.type==='image/webp'||r.blob.type==='image/jpeg'),'Decode/resize/re-encode and thumbnail use local browser codec.');
    await test('DIET-06-CHECKSUM',async()=>prepared.media.every((r)=>r.byte_size===r.blob.size)&&await blobChecksum(prepared.media[0].blob)===prepared.metadata.checksum,'Prepared Blob hashes and sizes match metadata.');
    const countBefore=(await c.repositories.dietLog.list()).length;
    await test('DIET-07-PROCESS-FAIL',async()=>await reject(()=>media.prepare(new Blob(['broken'],{type:'image/jpeg'})))&&(await c.repositories.dietLog.list()).length===countBefore&&(await binaries(c)).length===0,'Image decode failure creates no database records.');
    log=await diet.save(input,log.id,log.revision,[],[prepared]);const one=(await diet.get(log.id)).photos[0];
    await test('DIET-08-ONE-PHOTO',async()=>one.diet_log_id===log.id&&(await binaries(c)).length===2&&!Object.values(one).some((v)=>v instanceof Blob),'One metadata row references separate main/thumbnail binaries.');
    const more=await media.prepare(await photoFile('#77aa55'));log=await diet.save({...input,content:'추가 사진'},log.id,log.revision,[one.id],[more]);
    let photos=(await diet.get(log.id)).photos;
    await test('DIET-09-MIXED',()=>photos.length===2&&photos[0].id===one.id&&photos[0].sort_order===0&&photos[1].sort_order===1,'Existing and new photos retain stable order in one save.');
    log=await diet.save(input,log.id,log.revision,[photos[1].id],[]);
    await test('DIET-10-REMOVE',async()=>(await diet.get(log.id)).photos.length===1&&(await c.repositories.dietPhoto.getByIdIncludingDeleted(one.id)).deleted_at!==null,'Photo removal soft-deletes metadata while retaining binary for safe history/backup.');
    log=await diet.delete(log.id,log.revision);
    await test('DIET-11-DELETE',async()=>log.deleted_at!==null&&(await c.repositories.dietPhoto.listByDiet(log.id)).length===0&&(await media.status()).orphanKeys.length===0,'Diet deletion tombstones active photos and leaves no binary without any metadata reference.');
    log=await diet.restore(log.id,log.revision);
    await test('DIET-12-RESTORE',async()=>(await diet.get(log.id)).photos.length===1&&(await diet.get(log.id)).photos[0].id===photos[1].id,'Restore revives only photos removed with diet, not earlier individually removed photos.');
    const orphanKey=`${crypto.randomUUID()}.webp`,orphanBlob=prepared.media[0].blob;
    await c.database.runTransaction(['media_blobs'],'readwrite',({store})=>request(store('media_blobs').add({storage_key:orphanKey,blob:orphanBlob,byte_size:orphanBlob.size,checksum:prepared.metadata.checksum,created_at:new Date().toISOString()})));
    await test('DIET-13-GC',async()=>{const before=await media.status();const result=await media.collectOrphans();return before.orphanKeys.includes(orphanKey)&&before.inactiveKeys.includes(one.storage_key)&&result.removed===1&&(await binaries(c)).length===4;},'GC finds active-unreferenced files but deletes only true orphans; tombstone files remain restorable.');
    for(const step of ['diet-after-log','diet-after-photo','diet-after-blob','diet-before-commit']) await test(`DIET-14-ROLLBACK-${step}`,async()=>{const before=await state(c),addition=await media.prepare(file);failure=step;const rejected=await reject(()=>diet.save(input,undefined,undefined,[],[addition]));failure=null;return rejected&&equal(before,await state(c));},'Injected save failure leaves no partial diet, metadata or Blob.');
    await test('DIET-15-QUOTA',async()=>{const before=await state(c),addition=await media.prepare(file);failure='diet-after-blob';quota=true;let error;try{await diet.save(input,log.id,log.revision,(await diet.get(log.id)).photos.map((p)=>p.id),[addition]);}catch(e){error=e;}finally{failure=null;quota=false;}return error?.code==='MEDIA_QUOTA'&&!error.message.includes('sensitive')&&equal(before,await state(c));},'QuotaExceeded at binary write rolls back existing record and shows safe retry guidance.');
    for(const operation of ['save','delete','restore']) await test(`DIET-24-${operation}-ROLLBACK`,async()=>{
      let row=await diet.save(input,undefined,undefined,[],[await media.prepare(file)]);
      if(operation==='restore')row=await diet.delete(row.id,row.revision);
      const before=await state(c);failure='diet-before-commit';
      const failed=await reject(()=>operation==='save'?diet.save({...input,memo:'not committed'},row.id,row.revision,[],[]):diet[operation](row.id,row.revision));failure=null;
      const same=failed&&equal(before,await state(c));
      // This fixture lives in the same DB and remains valid, but comparisons below
      // derive sizes from the actual snapshot rather than assuming a fixed row count.
      return same;
    },'Existing edit/delete/restore rollback preserves diet, photos and binary exactly.');
    const profile=c.identityContext.getCurrentProfileId(),other=await c.repositories.profile.create({display_name:'다른 프로필',timezone:'Asia/Seoul',seed_version:1});c.identityContext.setCurrentProfileId(other.id);
    await test('DIET-16-PROFILE',async()=>(await diet.day('2026-09-07')).length===0&&await reject(()=>media.photoBlob(photos[1].id),'MEDIA_INVALID')&&await reject(()=>diet.delete(log.id,log.revision),'ENTITY_NOT_FOUND'),'Other Profile cannot read photos or mutate diet.');c.identityContext.setCurrentProfileId(profile);
    const saved=await state(c);c.database.close();await c.database.open();await c.bootstrapService.initialize();
    await test('DIET-17-REOPEN',async()=>equal(saved,await state(c))&&(await media.photoBlob(photos[1].id)).size>0,'Reopening database preserves binary and metadata.');
    const exported=await c.backupExportService.exportCurrentProfile();
    await test('DIET-BACKUP-01',async()=>exported.filename.endsWith('.zip')&&exported.document.backupVersion===2&&(await readZip(exported.blob)).size===exported.document.mediaManifest.length+2,'Photo snapshot produces valid v2 ZIP with manifest/data and all media files including tombstones.');
    const target=await make('restore'),targetDevice=await target.repositories.deviceSettings.get('device_id'),preview=await target.backupImportService.inspectFile(exported.blob);await target.backupImportService.restorePreview(preview.id);
    await test('DIET-BACKUP-02',async()=>equal(await state(c),await state(target))&&equal(targetDevice,await target.repositories.deviceSettings.get('device_id')),'Pristine v2 restore preserves every UUID/revision/relation/media hash and device identity.');
    const again=await target.backupExportService.exportCurrentProfile();
    await test('DIET-BACKUP-03',()=>again.document.integrity.payloadHash===exported.document.integrity.payloadHash&&equal(again.document.mediaManifest,exported.document.mediaManifest),'Restore then re-export has identical canonical portable payload and media manifests.');
    for(const mode of ['missing','tampered','extra','json','duplicate','relation']) await test(`DIET-BACKUP-04-${mode}`,async()=>{const entries=await readZip(exported.blob),key=`media/${one.storage_key}`;
      if(mode==='missing')entries.delete(key);if(mode==='tampered')entries.set(key,new Uint8Array([1,2,3]));if(mode==='extra')entries.set(`media/${crypto.randomUUID()}.webp`,new Uint8Array([4]));if(mode==='json')entries.set('data.json',new TextEncoder().encode('{}'));
      if(mode==='relation'){const doc=JSON.parse(new TextDecoder().decode(entries.get('data.json')));const active=doc.data.diet_photos.find(r=>r.deleted_at===null);doc.data.diet_logs.find(r=>r.id===active.diet_log_id).deleted_at=new Date().toISOString();doc.integrity.payloadHash=await payloadHash(doc);const bytes=new TextEncoder().encode(canonicalJson(doc));entries.set('data.json',bytes);const manifest=JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));manifest.jsonChecksum=await blobChecksum(new Blob([bytes]));entries.set('manifest.json',new TextEncoder().encode(canonicalJson(manifest)));}
      if(mode==='duplicate'){const doc=JSON.parse(new TextDecoder().decode(entries.get('data.json')));doc.mediaManifest.push(doc.mediaManifest[0]);const bytes=new TextEncoder().encode(canonicalJson(doc));entries.set('data.json',bytes);const manifest=JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));manifest.jsonChecksum=await blobChecksum(new Blob([bytes]));entries.set('manifest.json',new TextEncoder().encode(canonicalJson(manifest)));}
      const before=await state(target);return await reject(()=>target.backupImportService.inspectFile(writeZip(entries)))&&equal(before,await state(target));},'Missing/corrupt/extra/duplicate binary or invalid JSON refuses whole restore before writes.');
    await target.dietService.save({...input,content:'교체될 데이터'},undefined,undefined,[],[await target.mediaService.prepare(file)]);
    for(const step of ['replace-cleared:media_blobs','restore-after-media']) await test(`DIET-BACKUP-10-FORCE-ROLLBACK-${step}`,async()=>{const before=await state(target),p=await target.backupImportService.inspectFile(exported.blob),plan=await target.backupImportService.prepareReplacement({kind:'replace',previewId:p.id,backupFirst:false});failure=step;const failed=await reject(()=>target.backupImportService.confirmReplacement(plan.id),'RESTORE_TRANSACTION_FAILED');failure=null;return failed&&equal(before,await state(target));},'Force replace failure restores pre-existing portable rows and different media binaries together.');
    const forcePreview=await target.backupImportService.inspectFile(exported.blob),pending=await target.backupImportService.prepareReplacement({kind:'replace',previewId:forcePreview.id,backupFirst:false});await target.backupImportService.confirmReplacement(pending.id);
    await test('DIET-BACKUP-05-FORCE',async()=>equal(await state(c),await state(target)),'Explicit force replace restores portable data and binaries atomically.');
    for(const step of ['restore-row:diet_photos','restore-media-row','restore-after-media','restore-before-commit'])await test(`DIET-BACKUP-06-${step}`,async()=>{const t=await make('rollback'),before=await state(t),p=await t.backupImportService.inspectFile(exported.blob);failure=step;const rejected=await reject(()=>t.backupImportService.restorePreview(p.id),'RESTORE_TRANSACTION_FAILED');failure=null;return rejected&&equal(before,await state(t));},'Restore fault rolls back metadata/binary/pointer together.');
    const oldDoc=structuredClone(globalThis.__BACKUP_TEST_DOCUMENT__);oldDoc.source.appVersion='0.6.0';oldDoc.source.dbVersion=1;oldDoc.source.schemaVersion=1;delete oldDoc.data.calendar_event_links;delete oldDoc.counts.calendar_event_links;oldDoc.integrity.payloadHash=await payloadHash(oldDoc);const v1=await make('v1');const oldPreview=await v1.backupImportService.inspectFile(new Blob([canonicalJson(oldDoc)]));await v1.backupImportService.restorePreview(oldPreview.id);
    await test('DIET-BACKUP-07-V1',async()=>equal(Object.fromEntries(Object.entries((await v1.backupSnapshotReader.readCurrentProfile()).data).filter(([key])=>key!=='calendar_event_links')),oldDoc.data)&&(await binaries(v1)).length===0,'Original Schema1 JSON still restores exactly into DB3 with empty calendar links.');
    await test('DIET-18-INDEX',async()=>{const original=IDBObjectStore.prototype.getAll;IDBObjectStore.prototype.getAll=function(){throw new Error('full scan');};try{return(await diet.day('2026-09-07')).length===4;}finally{IDBObjectStore.prototype.getAll=original;}},'Diet day and photo list use Profile/time and Profile/diet/sort indexes.');
    const views=await make('views'),today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),v=await views.dietService.save({...input,eaten_at_local:`${today}T12:00`},undefined,undefined,[],[await views.mediaService.prepare(file)]);
    const context={root,services:{diet:views.dietService,media:views.mediaService},setTitle(){},showToast(){},showError(m,e){throw e;},isCurrent:()=>true,navigate(){}};const reads=[],original=views.mediaService.photoBlob.bind(views.mediaService);views.mediaService.photoBlob=(id,thumb)=>{reads.push(thumb);return original(id,thumb);};
    await renderDietList(context);
    await test('DIET-19-THUMBNAIL',()=>reads.length===1&&reads[0]===true&&root.querySelector('img').src.startsWith('blob:'),'List loads only thumbnail binary through Media Service.');reads.length=0;await renderDietDetail(context,v.id);
    await test('DIET-20-DETAIL',()=>reads.length===1&&reads[0]===false&&root.querySelector('img').src.startsWith('blob:'),'Detail loads compressed main binary through Media Service.');
    await test('DIET-21-CALENDAR',async()=>{const entries=await views.dietService.calendarEntries(`${today}T00:00`,`${today}T23:59:59`);return entries.length===1&&entries[0].healthRoute===`/diet/log/${v.id}`&&entries[0].label==='식단 · 점심';},'Calendar projection uses original diet rows and links to detail.');
    const reset=await target.backupImportService.prepareReplacement({kind:'reset',backupFirst:true});
    await test('DIET-BACKUP-08-BACKUP-FIRST',()=>reset.backup.blob instanceof Blob&&reset.backup.document.backupVersion===2,'Backup-first destructive flow includes actual ZIP binary, not JSON-only metadata.');
    await target.backupImportService.confirmReplacement(reset.id,reset.backup.blob);
    await test('DIET-BACKUP-09-RESET',async()=>(await binaries(target)).length===0&&(await target.backupRestoreCommand.inspectTarget()).pristine,'Authorized reset clears portable records and binary together.');
  } finally {failure=null;quota=false;releaseDietUrls();root.remove();for(const c of containers)c.database.close();for(const name of names)await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=resolve;r.onerror=()=>reject(r.error);});}
}

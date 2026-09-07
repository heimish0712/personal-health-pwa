import { createContainer } from '../../js/bootstrap/container.js';
import { populateLargeFixture } from './large-fixture.js';
import { runMigrationHarness, populateV1Relations } from './migration-harness.js';
import { canonicalJson } from '../../js/core/backup/canonical-json.js';
import { payloadHash } from '../../js/core/backup/backup-integrity.js';
import { blobChecksum } from '../../js/core/media-rules.js';
import { diagnoseData } from '../../js/core/data-diagnostic.js';
import { UpdateController } from '../../js/core/update-controller.js';
import { MaintenanceCoordinator } from '../../js/core/maintenance-coordinator.js';
import { readZip,writeZip } from '../../js/core/backup/zip-store.js';

export async function runOperationsTests(test) {
  const containers=[];let failure=null;
  const make=async()=>{const c=createContainer({dbName:`personal-health-pwa-test-operations-${crypto.randomUUID()}`,clock:{nowIso:()=> '2026-09-07T12:00:00.000Z'},faultInjector(step){if(step===failure)throw new Error('Injected operational failure');}});containers.push(c);await c.database.open();await c.bootstrapService.initialize();return c;};
  const rejects=async(work)=>{try{await work();return false;}catch{return true;}};
  const state=async(c)=>{const s=await c.backupSnapshotReader.readCurrentProfile({includeMedia:true});return canonicalJson({data:s.data,media:await Promise.all(s.media.map(async(r)=>({key:r.storage_key,hash:await blobChecksum(r.blob)}))),device:await c.repositories.deviceSettings.get('device_id'),pointer:await c.repositories.deviceSettings.get('current_profile_id')});};
  try {
    const c=await make();await populateV1Relations(c);const v1=await c.backupExportService.exportCurrentProfile();
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const image=await new Promise((resolve)=>canvas.toBlob(resolve,'image/png'));const photo=await c.mediaService.prepare(image);
    const diet=await c.dietService.save({eaten_at_local:'2026-09-07T12:00',meal_type:'lunch',content:'PRIVATE_HEALTH_MEMO'},undefined,undefined,[],[photo]);
    await test('OPS-DIAG-HEALTHY',async()=>(await c.operationsService.diagnose()).healthy,'Read-only diagnostic accepts linked reservations/usage/InBody/photos and portable tombstones.');
    const raw=await c.operationsReader.diagnosticSnapshot();
    const corruptions={
      EXERCISE_TEMPLATE_BROKEN:(s)=>{s.data.exercise_logs[0].template_id=crypto.randomUUID();},
      PASS_USAGE_REFERENCE_BROKEN:(s)=>{s.data.pass_usage_logs[0].pass_id=crypto.randomUUID();},
      SCHEDULE_LOG_BROKEN:(s)=>{s.data.exercise_schedules[0].completed_exercise_log_id=crypto.randomUUID();},
      INBODY_WEIGHT_BROKEN:(s)=>{s.data.weight_logs.find(w=>w.source==='inbody').weight=1;},
      MEDIA_MISSING:(s)=>{s.mediaKeys=[];},
      DUPLICATE_ACTIVE_USAGE:(s)=>{s.data.pass_usage_logs.push({...s.data.pass_usage_logs[0],id:crypto.randomUUID()});},
      CURRENT_PROFILE_INVALID:(s)=>{s.currentProfileId=crypto.randomUUID();}
    };
    for(const [code,mutate] of Object.entries(corruptions))await test(`OPS-DIAG-${code}`,()=>{const copy=structuredClone(raw);mutate(copy);const result=diagnoseData(copy);return result.issues.some(r=>r.code===code) && !JSON.stringify(result).includes('PRIVATE_HEALTH_MEMO');},'Targeted corrupt relation detected without exposing health data or repairing it.');
    const before=await state(c);await c.operationsService.diagnose();
    await test('OPS-DIAG-READONLY',async()=>before===await state(c),'Diagnostic does not modify UUID, revision, tombstones, binary or pointer.');
    const storage=await c.operationsService.storage(),expected=Object.values(raw.data).flat().reduce((n,r)=>n+new TextEncoder().encode(JSON.stringify(r)).length,0);
    await test('OPS-STORAGE-ESTIMATE',()=>storage.portableBytes===expected && storage.portableCount===Object.values(raw.data).flat().length,'Portable JSON UTF-8 estimate has exact test bytes and explicit approximate semantics.');
    const orphan={...photo.media[0],storage_key:crypto.randomUUID()+'.webp'};await c.database.runTransaction(['media_blobs'],'readwrite',({store})=>{store('media_blobs').add(orphan);});
    let stats=await c.mediaService.status();
    await test('OPS-GC-PREVIEW',()=>stats.orphanKeys.length===1 && stats.orphanBytes===orphan.blob.size && stats.bytes===photo.media.reduce((n,r)=>n+r.blob.size,0)+orphan.blob.size,'GC preview reports exact orphan count and binary bytes.');
    await c.dietService.delete(diet.id,diet.revision);const removed=await c.mediaService.collectOrphans();stats=await c.mediaService.status();
    await test('OPS-GC-PRESERVE',()=>removed.removed===1 && stats.count===2 && stats.orphanKeys.length===0,'Only orphan removed; both tombstone-referenced media retained.');
    let release,entered;const active=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
    const holding=c.coordinator.backup(async()=>{entered();await wait;});await active;
    const peer=new MaintenanceCoordinator(c.database.name);
    await test('OPS-GC-BACKUP-LOCK',()=>rejects(()=>peer.collect(()=>c.mediaStorage.collectOrphans())),'Independent coordinator cannot GC while backup shared lock is held.');
    const nested=await c.backupExportService.exportCurrentProfile();release();await holding;
    await test('OPS-GC-NESTED-BACKUP',()=>nested.document.backupVersion===2,'Backup-first nested shared operation does not deadlock.');
    let free,held;const exclusiveEntered=new Promise(r=>held=r),exclusiveWait=new Promise(r=>free=r);const gc=c.coordinator.collect(async()=>{held();await exclusiveWait;});await exclusiveEntered;
    await test('OPS-GC-EXCLUSIVE',()=>rejects(()=>c.backupExportService.exportCurrentProfile()),'Backup refuses an active exclusive maintenance operation.');free();await gc;
    await test('OPS-GC-UNSUPPORTED',()=>rejects(()=>new MaintenanceCoordinator('test',null).collect(()=>{})),'GC safely unavailable without cross-context lock support.');
    const persist=navigator.storage.persist, persisted=navigator.storage.persisted,estimate=navigator.storage.estimate;let requests=0;
    try{navigator.storage.persisted=async()=>true;navigator.storage.persist=async()=>{requests++;return false;};
      await test('OPS-PERSIST-GRANTED',async()=>await c.mediaService.requestPersistence() && requests===0,'Granted persistence is not requested again.');
      navigator.storage.persisted=async()=>false;
      await test('OPS-PERSIST-DENIED',async()=>!(await c.mediaService.requestPersistence()) && requests===1,'Denied persistence is a nonfatal result.');
      navigator.storage.estimate=async()=>({usage:89,quota:100});
      await test('OPS-SPACE-WARNING',async()=>!await c.mediaService.spaceWarning(0) && Boolean(await c.mediaService.spaceWarning(2)),'Warning includes prepared image bytes when projected usage reaches 90 percent.');
    }finally{navigator.storage.persist=persist;navigator.storage.persisted=persisted;navigator.storage.estimate=estimate;}
    for(let i=0;i<205;i++)await c.repositories.appLog.append({level:'ERROR',event:'OPS_TEST',message:'PRIVATE_HEALTH_MEMO',context:{memo:'PRIVATE_HEALTH_MEMO',photo:photo,code:'TEST_ERROR',name:'Error'}});
    const exportedLogs=await c.operationsService.exportLogs();
    await test('OPS-LOG-PRIVACY',async()=>await c.repositories.appLog.count()===200 && !exportedLogs.includes('PRIVATE_HEALTH_MEMO') && !exportedLogs.includes('storage_key') && exportedLogs.includes('TEST_ERROR'),'Retention capped at 200; stored/exported messages and contexts exclude private payload.');
    let guard=true,allowed=false,reloads=0,notifications=0,posts=0;const update=new UpdateController({hasGuard:()=>guard,canLeave:()=>allowed,reload:()=>reloads++,notify:()=>notifications++});
    update.controllerChanged();update.apply({postMessage(){posts++;}});
    await test('OPS-UPDATE-DIRTY',()=>reloads===0 && notifications===1 && posts===0,'External controller change and rejected update never reload dirty form.');allowed=true;update.apply();
    await test('OPS-UPDATE-ACCEPT',()=>reloads===1,'Explicit accepted update applies pending controller reload.');
    const target=await make();await target.healthService.saveWeight({measured_at_local:'2026-09-01T09:00',weight:80});const original=await state(target);
    const badDocs=[['checksum',(d)=>d.integrity.payloadHash='0'.repeat(64)],['uuid',(d)=>{d.data.exercise_logs.push({...d.data.exercise_logs[0]});d.counts.exercise_logs++;}],['reference',(d)=>d.data.exercise_logs[0].template_id=crypto.randomUUID()],['version',(d)=>d.backupVersion=99],['schema',(d)=>d.source.schemaVersion=99]];
    for(const [name,mutate] of badDocs){const doc=structuredClone(v1.document);mutate(doc);if(name!=='checksum')doc.integrity.payloadHash=await payloadHash(doc);
      await test(`OPS-BACKUP-${name}`,async()=>await rejects(()=>target.backupImportService.inspectFile(new Blob([JSON.stringify(doc)]))) && original===await state(target),'Invalid backup rejected on populated target without modifying existing data.');}
    await test('OPS-BACKUP-JSON',async()=>await rejects(()=>target.backupImportService.inspectFile(new Blob(['{broken']))) && original===await state(target),'Malformed JSON cannot mutate populated target.');
    for(const mode of ['missing','checksum']){const files=await readZip(nested.blob),key=[...files.keys()].find(x=>x.startsWith('media/'));if(mode==='missing')files.delete(key);else files.set(key,new Uint8Array([1,2,3]));const bad=await writeZip(files);
      await test(`OPS-BACKUP-MEDIA-${mode}`,async()=>await rejects(()=>target.backupImportService.inspectFile(bad)) && original===await state(target),'Missing/altered media rejects entire ZIP and preserves target.');}
    for(const mode of ['replace','reset']){
      const preview=mode==='replace'?await target.backupImportService.inspectFile(nested.blob):null;
      const pending=await target.backupImportService.prepareReplacement({kind:mode,previewId:preview?.id,backupFirst:false});failure=mode==='replace'?'restore-after-media':'reset-before-commit';
      const rejected=await rejects(()=>target.backupImportService.confirmReplacement(pending.id));failure=null;
      await test(`OPS-RECOVERY-${mode}`,async()=>rejected && original===await state(target),'Injected last-stage failure preserves all previous data, media, pointer and device ID.');
    }
    const large=await make(),sizes=await populateLargeFixture(large),measurements={sizes};
    const time=async(name,work)=>{const start=performance.now(),result=await work();measurements[name]=Number((performance.now()-start).toFixed(2));return result;};
    large.database.close();await time('bootMs',async()=>{await large.database.open();await large.bootstrapService.initialize();});
    const home=await time('homeMs',()=>large.dashboardService.summary());const calendar=await time('calendarMs',()=>large.calendarService.entries('2026-09-01T00:00','2026-10-01T00:00'));
    const legacy=await time('legacyRecentMs',async()=>{const logs=await large.repositories.exerciseLog.list({sort:(a,b)=>b.performed_at.localeCompare(a.performed_at)});const types=await large.repositories.exerciseType.list({includeDeleted:true});return {logs:logs.slice(0,20),scanned:logs.length,types};});
    const recent=await time('recentMs',()=>large.exerciseQueryService.listRecentLogs());const graph=await time('graphMs',()=>large.healthService.graph('weight','30'));const day=await time('dietDayMs',()=>large.dietService.day('2026-09-07'));
    const backup=await time('exportMs',()=>large.backupExportService.exportCurrentProfile());const restored=await make();const preview=await time('validateMs',()=>restored.backupImportService.inspectFile(backup.blob));await time('restoreMs',()=>restored.backupImportService.restorePreview(preview.id));
    globalThis.__OPERATIONS_PROFILE__=measurements;
    await test('OPS-PERF-VIEWS',()=>home.exerciseCount===50 && calendar.length===217 && recent.length===20 && graph.length===50 && day.length===50,'Large test-only fixture: 3000 each exercise/schedule/weight/diet, 1000 InBody/photos, 2000 media blobs; all source views correct. '+JSON.stringify(measurements));
    const getAll=IDBObjectStore.prototype.getAll;IDBObjectStore.prototype.getAll=function(){throw new Error('Full store scan in recent query');};
    try{await test('OPS-PERF-RECENT-INDEX',async()=>(await large.exerciseQueryService.listRecentLogs()).length===20,'Recent exercise now reads a bounded profile/time cursor and only referenced types; prior algorithm materialized '+legacy.scanned+' logs.');}finally{IDBObjectStore.prototype.getAll=getAll;}
    await test('OPS-PERF-RESTORE',async()=>canonicalJson(await large.dashboardService.summary())===canonicalJson(await restored.dashboardService.summary()) && (await restored.mediaService.status()).count===2000,'Large ZIP pristine restore retains dashboard relationships and every binary.');
    await runMigrationHarness(test,{populate:populateV1Relations});
  }finally{failure=null;for(const c of containers){c.database.close();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(c.database.name);r.onsuccess=resolve;r.onerror=()=>reject(r.error);});}}
}

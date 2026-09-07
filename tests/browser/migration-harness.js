import { createContainer } from '../../js/bootstrap/container.js';
import { IndexedDbDatabase } from '../../js/data/indexeddb/database.js';
import { applyMigrations } from '../../js/data/indexeddb/migrations.js';
import { canonicalJson } from '../../js/core/backup/canonical-json.js';
// Extend with another from/to + populate fixture when a real migration is introduced.
export async function runMigrationHarness(test,{from=1,to=2,populate}) {
  const name=`personal-health-pwa-test-migration-harness-${crypto.randomUUID()}`,connections=[];
  const open=async(version)=>{const c=createContainer({dbName:name,dbVersion:version});connections.push(c.database);await c.database.open();await c.bootstrapService.initialize();return c;};
  const snapshot=async(c)=>canonicalJson({data:await c.backupSnapshotReader.readCurrentProfile(),device:await c.repositories.deviceSettings.get('device_id')});
  try{
    const old=await open(from);await populate(old);const before=await snapshot(old);old.database.close();
    const fail=new IndexedDbDatabase({name,version:to,migrate(args){applyMigrations(args);throw new Error('Injected migration abort');}});connections.push(fail);
    let rejected=false;try{await fail.open();}catch{rejected=true;}fail.close();
    const unchanged=await open(from);
    await test('OPS-MIG-FAIL',async()=>rejected && before===await snapshot(unchanged),'Failed actual upgrade leaves previous DB UUID/revision/tombstones/relations/device identity intact.');unchanged.database.close();
    const upgraded=await open(to);
    await test('OPS-MIG-UPGRADE',async()=>before===await snapshot(upgraded) && upgraded.database.version===to,'Reusable old-version fixture upgrades without modifying portable rows.');upgraded.database.close();
    const reopened=await open(to);
    await test('OPS-MIG-REOPEN',async()=>before===await snapshot(reopened),'Close/reopen after upgrade preserves exact fixture.');
  }finally{connections.forEach((db)=>db.close());await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=resolve;r.onerror=()=>reject(r.error);});}
}
export async function populateV1Relations(c) {
  const type=(await c.exerciseQueryService.listActiveTypes())[0];
  const pass=await c.passScheduleService.savePass({exercise_type_id:type.id,name:'이전 이용권',total_count:60,start_date:'2026-01-01',expiry_date:'2027-12-31'});
  let log=await c.exerciseLogService.create({exercise_type_id:type.id,performed_at_local:'2026-09-07T10:00',values:{duration_minutes:50},pass_id:pass.id});
  log=await c.exerciseLogService.update(log.id,{performed_at_local:'2026-09-07T10:00',values:{duration_minutes:45},pass_id:pass.id,memo:'revision 2'},log.revision);
  const schedule=await c.passScheduleService.saveSchedule({exercise_type_id:type.id,scheduled_at_local:'2026-09-07T12:00',expected_duration_minutes:40});
  await c.passScheduleService.completeSchedule(schedule.id,{performed_at_local:'2026-09-07T12:00',values:{duration_minutes:40},pass_id:pass.id},schedule.revision);
  await c.healthService.saveInbody({measured_at_local:'2026-09-07T09:00',weight:70,link_weight:true});
  const w=await c.healthService.saveWeight({measured_at_local:'2026-09-06T09:00',weight:71});await c.healthService.deleteWeight(w.id,w.revision);
  const t=await c.exerciseQueryService.getActiveTemplate(type.id);await c.exerciseManagementService.createTemplateVersion(type.id,[{key:'duration_minutes'},{key:'distance_km'}],{expectedTemplateId:t.id,expectedTemplateRevision:t.revision});
}

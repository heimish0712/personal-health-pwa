import { createContainer } from '../../js/bootstrap/container.js';
import { canonicalJson } from '../../js/core/backup/canonical-json.js';
import { renderCalendar } from '../../js/pages/exercise/pass-schedule.page.js';
import { renderDashboard, releaseDashboardUrls } from '../../js/pages/dashboard.page.js';
import { parseRoute, initialRecordTime } from '../../js/router.js';
import { nowLocalInput } from '../../js/core/datetime.js';

export async function runDashboardTests(test) {
  const containers = [], root = document.createElement('div'); document.body.append(root);
  const make = async () => { const c = createContainer({ dbName: `personal-health-pwa-test-dashboard-${crypto.randomUUID()}`, clock: { nowIso: () => '2026-09-07T12:00:00.000Z' } }); containers.push(c); await c.database.open(); await c.bootstrapService.initialize(); return c; };
  const equal = (a,b) => canonicalJson(a) === canonicalJson(b);
  const month = ['2026-09-01T00:00','2026-10-01T00:00'];
  try {
    const c = await make(), r = c.repositories, d = c.dashboardService, cal = c.calendarService, a = c.passScheduleService;
    const empty = await d.summary();
    await test('DASH-01-EMPTY', () => empty.latest === null && empty.delta === null && empty.exerciseCount === 0 && empty.dietCount === 0, 'Empty profile renders zero counts and absent measurements.');
    const { exerciseType: type } = await c.exerciseManagementService.createExerciseType({ name: '테스트 <운동>', fields: [{ key: 'duration_minutes' }] });
    const pass = await a.savePass({ exercise_type_id: type.id, name: '60회', total_count: 60, start_date:'2026-01-01', expiry_date:'2027-12-31' });
    const input = { exercise_type_id:type.id, performed_at_local:'2026-09-07T10:00', values:{duration_minutes:30}, pass_id:pass.id };
    let direct = await c.exerciseLogService.create(input);
    await c.exerciseLogService.create({...input,performed_at_local:'2026-09-06T23:59',pass_id:null});
    let schedule = await a.saveSchedule({exercise_type_id:type.id,scheduled_at_local:'2026-09-07T12:00',expected_duration_minutes:50});
    const completed = await a.completeSchedule(schedule.id,{...input,performed_at_local:'2026-09-07T12:00',values:{duration_minutes:50}},schedule.revision);
    const pending = await a.saveSchedule({exercise_type_id:type.id,scheduled_at_local:'2026-09-07T19:00',expected_duration_minutes:45});
    await a.saveSchedule({exercise_type_id:type.id,scheduled_at_local:'2026-09-07T20:00',expected_duration_minutes:45,status:'cancelled'});
    const w = await c.healthService.saveWeight({measured_at_local:'2026-09-07T08:00',weight:70});
    let b = await c.healthService.saveInbody({measured_at_local:'2026-09-07T09:00',weight:69.5,skeletal_muscle_mass:30,body_fat_percentage:24,link_weight:true});
    const canvas = document.createElement('canvas'); canvas.width=40;canvas.height=30;
    const image = await new Promise((resolve)=>canvas.toBlob(resolve,'image/png'));
    const photo = await c.mediaService.prepare(image);
    let diet = await c.dietService.save({eaten_at_local:'2026-09-07T12:30',meal_type:'lunch',content:'테스트 식단 <script>'},undefined,undefined,[],[photo]);
    await c.dietService.save({eaten_at_local:'2026-09-07T08:30',meal_type:'breakfast',content:'아침'});
    let summary = await d.summary(), entries = await cal.entries(...month);
    await test('DASH-02-WEIGHT',()=>summary.latest.source_ref_id===b.id && summary.previous.id===w.id && summary.delta===-0.5,'Latest measurement and previous same-day measurement determine delta.');
    await test('DASH-03-WEEK',()=>summary.exerciseCount===2 && summary.exerciseMinutes===80 && summary.week.start==='2026-09-06T15:00:00.000Z','Monday local midnight boundary excludes Sunday and counts actual logs once.');
    await test('DASH-04-PASS',()=>summary.passes[0].remaining===58,'Remaining count comes from used, nondeleted ledger rows.');
    await test('DASH-05-DIET',()=>summary.dietCount===2 && summary.recentDiet.id===diet.id && summary.thumbnail.diet_log_id===diet.id,'Today diet count, latest record and first sorted thumbnail.');
    await test('DASH-06-INBODY',()=>summary.inbody.id===b.id && summary.inbody.skeletal_muscle_mass===30,'Latest InBody uses measured_at cursor.');
    await test('DASH-07-SCHEDULE',()=>summary.schedules.length===1 && summary.schedules[0].id===pending.id && summary.recentExercise.id===completed.id,'Today schedule excludes cancelled/completed; latest exercise includes completion.');
    await test('CAL-01-COMPLETED',()=>entries.filter((x)=>x.log?.id===completed.id).length===1 && entries.find((x)=>x.id===schedule.id).title==='테스트 <운동> · 완료 · 운동기록','Linked completion projects one event with both source routes.');
    await test('CAL-02-DIRECT',()=>entries.filter((x)=>x.id===direct.id).length===1 && !entries.find((x)=>x.id===direct.id).schedule,'Direct exercise remains distinct.');
    await test('CAL-03-HEALTH',()=>entries.filter((x)=>x.healthRoute===`/weight/inbody/${b.id}`).length===1 && equal(entries.find((x)=>x.id===b.id).categories,['weight','inbody']) && entries.some((x)=>x.id===w.id),'Linked measurement is one event with weight and InBody indicators; manual weight separate.');
    await test('CAL-04-DIET',()=>entries.filter((x)=>x.categories.includes('diet')).length===2,'Diet events use original IDs and detail routes.');
    direct = await c.exerciseLogService.softDelete(direct.id,direct.revision);
    await test('DASH-08-DELETE',async()=>{const s=await d.summary();return s.exerciseCount===1 && s.exerciseMinutes===50 && s.passes[0].remaining===59 && !(await cal.entries(...month)).some((x)=>x.id===direct.id);},'Soft-delete immediately changes both projections and balance.');
    direct = await c.exerciseLogService.restore(direct.id,direct.revision);
    await test('DASH-09-RESTORE',async()=>(await d.summary()).exerciseCount===2,'Restore reappears on next query.');
    schedule=await a.schedule(schedule.id);await a.undoSchedule(schedule.id,schedule.revision);
    await test('CAL-05-UNDO',async()=>{const s=await d.summary(),e=await cal.entries(...month);return s.exerciseCount===1 && s.passes[0].remaining===59 && e.find((x)=>x.id===schedule.id).label==='예정' && !e.some((x)=>x.log?.id===completed.id);},'Undo updates pending event and excludes soft-deleted linked exercise.');
    schedule=await a.schedule(schedule.id);await a.completeSchedule(schedule.id,{...input,performed_at_local:'2026-10-01T00:01'},schedule.revision);
    await test('CAL-06-CROSS-MONTH',async()=>{const sept=await cal.entries(...month),oct=await cal.entries('2026-10-01T00:00','2026-11-01T00:00');return !sept.some((x)=>x.id===schedule.id) && oct.filter((x)=>x.id===schedule.id).length===1 && oct.length===1;},'Actual date governs completed events even when scheduled date belongs to another month.');
    diet=await c.dietService.save({...diet,eaten_at_local:'2026-09-08T12:30'},diet.id,diet.revision,[summary.thumbnail.id]);
    b=await c.healthService.saveInbody({...b,weight:69},b.id,b.revision);
    await test('DASH-10-EDIT',async()=>{const s=await d.summary();return s.dietCount===1 && s.delta===-1 && !(await cal.entries('2026-09-07T00:00','2026-09-08T00:00')).some((x)=>x.id===diet.id);},'Diet date edit and linked measurement edit reflected without stored summaries.');
    const trashWeight = await c.healthService.saveWeight({measured_at_local:'2026-09-30T20:00',weight:50});
    await c.healthService.deleteWeight(trashWeight.id,trashWeight.revision);
    let trashBody = await c.healthService.saveInbody({measured_at_local:'2026-09-30T21:00',weight:49,link_weight:true});
    await c.healthService.deleteInbody(trashBody.id,trashBody.revision);
    const trashDiet = await c.dietService.save({eaten_at_local:'2026-09-30T22:00',meal_type:'dinner',content:'삭제'});
    await c.dietService.delete(trashDiet.id,trashDiet.revision);
    await a.setPassStatus(pass.id,'inactive',pass.revision);
    await test('DASH-16-DELETED-SOURCES',async()=>{const s=await d.summary(),events=await cal.entries(...month);return s.latest.weight===69 && s.inbody.id===b.id && s.recentDiet.id===diet.id && s.passes.length===0 && !events.some((x)=>[trashWeight.id,trashBody.id,trashDiet.id].includes(x.id));},'Deleted latest rows are skipped by cursors and calendar; inactive passes excluded by status index.');
    await a.setPassStatus(pass.id,'active',pass.revision+1);
    const originalProfile=c.identityContext.getCurrentProfileId(),other=await r.profile.create({display_name:'격리',timezone:'Asia/Seoul',seed_version:1});
    c.identityContext.setCurrentProfileId(other.id);
    await test('DASH-11-PROFILE',async()=>{const s=await d.summary();return !s.latest && !s.recentExercise && !s.recentDiet && s.passes.length===0 && (await cal.entries(...month)).length===0;},'Profile indexes and point lookups do not expose other profile records.');
    c.identityContext.setCurrentProfileId(originalProfile);
    const getAll=IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll=function(){throw new Error('Full store scan forbidden in views');};
    try { await test('DASH-12-INDEX',async()=>Boolean((await d.summary()).latest) && (await cal.entries(...month)).length>0,'Actual views succeed while ObjectStore.getAll is disabled; bounded Index.getAll/cursors and point gets only.'); }
    finally {IDBObjectStore.prototype.getAll=getAll;}
    const before={dashboard:await d.summary(),calendar:await cal.entries(...month)};
    const exported=await c.backupExportService.exportCurrentProfile();const target=await make();const preview=await target.backupImportService.inspectFile(exported.blob ?? new Blob([exported.content]));await target.backupImportService.restorePreview(preview.id);
    await test('DASH-13-BACKUP-V2',async()=>equal(before,{dashboard:await target.dashboardService.summary(),calendar:await target.calendarService.entries(...month)}) && (await target.mediaService.photoBlob(summary.thumbnail.id)).size>0,'ZIP restore preserves exact projected values, IDs, relationships and thumbnail.');
    c.database.close();await c.database.open();await c.bootstrapService.initialize();
    await test('DASH-14-REOPEN',async()=>equal(before,{dashboard:await d.summary(),calendar:await cal.entries(...month)}),'Reopen retains both read views exactly.');
    const context={root,services:{calendar:cal,dashboard:d,exerciseQuery:c.exerciseQueryService,media:c.mediaService},isCurrent:()=>true,setTitle(){},navigate(route){context.lastRoute=route;},showError(m,error){throw error;}};
    await renderDashboard(context);
    await test('DASH-15-RENDER',()=>root.querySelector('#home-weight').textContent==='69 kg' && root.querySelectorAll('#dashboard [data-dashboard-route]').length>=8 && root.querySelector('#home-diet-thumbnail img')?.src.startsWith('blob:') && !root.querySelector('script'),'Actual dashboard escapes text, shows values, routes and local thumbnail.');
    releaseDashboardUrls();root.innerHTML='';await renderCalendar({...context,selectedDate:'2026-09-07'});
    await test('CAL-07-SELECTED',()=>root.querySelector('#calendar-selected').textContent.includes('2026-09-07') && root.querySelectorAll('[data-calendar-entry]').length===6,'Selected-date list contains only that local day.');
    root.querySelector('[data-quick="/weight/log/new"]').click();
    await test('CAL-08-QUICK',()=>context.lastRoute==='/weight/log/new?date=2026-09-07&from=calendar' && initialRecordTime(parseRoute(context.lastRoute),'2026-09-09T13:20')==='2026-09-07T13:20','Quick record carries selected date and return destination to existing form.');
    await test('CAL-09-INVALID-DATE',()=>parseRoute('/calendar?date=2026-02-30').selectedDate===null && parseRoute('/calendar?date=<img>').selectedDate===null,'Malformed/nonexistent date context ignored.');
    root.innerHTML='';await renderCalendar(context);
    await test('CAL-10-TODAY',()=>root.querySelector('[aria-pressed=true]').dataset.calendarDate===nowLocalInput('Asia/Seoul').slice(0,10),'Default selected day follows current profile timezone.');
    const big=await make(), profile=big.identityContext.getCurrentProfileId();
    await big.database.runTransaction(['weight_logs'],'readwrite',({store})=>{for(let i=0;i<12000;i++){const time=i<100?'2026-09-07T00:00:00.000Z':'2020-01-01T00:00:00.000Z';store('weight_logs').add({id:crypto.randomUUID(),profile_id:profile,measured_at:time,weight:70,source:'manual',created_at:time,updated_at:time,revision:1,deleted_at:null});}});
    const {exerciseType:bigType,template:bigTemplate}=await big.exerciseManagementService.createExerciseType({name:'부하 운동',fields:[{key:'duration_minutes'}]});
    const bulkStores=['exercise_logs','exercise_schedules','diet_logs','inbody_logs'];
    await big.database.runTransaction(bulkStores,'readwrite',({store})=>{
      for(const name of bulkStores) for(let i=0;i<3000;i++) {
        const time=i<25?'2026-09-07T00:00:00.000Z':'2020-01-01T00:00:00.000Z';
        const row={id:crypto.randomUUID(),profile_id:profile,created_at:time,updated_at:time,revision:1,deleted_at:null};
        if(name==='exercise_logs') Object.assign(row,{exercise_type_id:bigType.id,template_id:bigTemplate.id,performed_at:time,values:{duration_minutes:30}});
        if(name==='exercise_schedules') Object.assign(row,{exercise_type_id:bigType.id,scheduled_at:time,expected_duration_minutes:30,status:'scheduled'});
        if(name==='diet_logs') Object.assign(row,{eaten_at:time,meal_type:'lunch',content:'부하'});
        if(name==='inbody_logs') Object.assign(row,{measured_at:time,weight:70,link_weight:false});
        store(name).add(row);
      }
    });
    const started=performance.now(),large=await big.calendarService.entries(...month),elapsed=performance.now()-started;
    await test('CAL-11-LARGE',()=>large.length===200 && elapsed<5000,`24,000 synthetic rows across five domains, 200 month matches: ${elapsed.toFixed(1)} ms; bounded measurement index.`);
  } finally {releaseDashboardUrls();root.remove();for(const c of containers){c.database.close();await new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase(c.database.name);req.onsuccess=resolve;req.onerror=()=>reject(req.error);});}}
}

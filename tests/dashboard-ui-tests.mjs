import fs from 'node:fs';
import path from 'node:path';
export async function runDashboardUiTests({cdp,pollEvaluate,runtimeTest,root}) {
  const ready=(selector)=>pollEvaluate(cdp,`Boolean(document.querySelector(${JSON.stringify(selector)}))`,Boolean,20000);
  const go=async(route,selector)=>{await cdp.evaluate(`location.hash=${JSON.stringify(route)}`);await ready(selector);};
  const click=(selector)=>cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=(values)=>cdp.evaluate(`(()=>{for(const [selector,value] of Object.entries(${JSON.stringify(values)})){const el=document.querySelector(selector);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  const selected='2036-05-17';
  await runtimeTest('DASH-UI-01-SUMMARY',async()=>{
    await go('/home','#dashboard');
    return cdp.evaluate(`(async()=>{const {bootstrapApplication}=await import('./js/bootstrap/bootstrap.js');const app=await bootstrapApplication();const s=await app.services.dashboard.summary();return document.querySelector('#home-diet-count').textContent===s.dietCount+'건' && document.querySelector('#home-exercise-count').textContent===s.exerciseCount+'회' && document.querySelector('#home-weight').textContent===s.latest.weight+' kg';})()`);
  },'Rendered home counts and measurement agree with fresh query after existing CRUD/media QA.');
  await runtimeTest('DASH-UI-02-THUMBNAIL',async()=>{ await pollEvaluate(cdp,"Boolean(document.querySelector('#home-diet-thumbnail img')?.naturalWidth)",Boolean,15000);return cdp.evaluate("document.querySelectorAll('#home-diet-thumbnail img').length===1");},'Dashboard decodes one local thumbnail from the latest diet.');
  const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'tests/results/v0.8.0-dashboard.png'),Buffer.from(shot.data,'base64'));
  await runtimeTest('CAL-UI-01-MONTH',async()=>{
    await go(`/calendar?date=${selected}`,'[data-calendar-date="2036-05-17"]');
    await click('#calendar-next');await ready('[data-calendar-date="2036-06-01"]');
    await click('#calendar-prev');await ready('[data-calendar-date="2036-05-01"]');
    await click('[data-calendar-date="2036-05-17"]');
    return cdp.evaluate(`document.querySelector('#calendar-selected').textContent.includes('${selected}') && location.hash.includes('date=${selected}')`);
  },'Month navigation and date selection preserve date in route.');
  for(const [kind,route,selector,values,save] of [
    ['weight','/weight/log/new','#health-at',{'#health-weight':'66.2'},'#health-save'],
    ['inbody','/weight/inbody/new','#health-at',{'#health-weight':'66.1','#health-skeletal_muscle_mass':'30'},'#health-save'],
    ['diet','/diet/log/new','#diet-at',{'#diet-content':'달력 빠른 식단','#diet-meal':'lunch'},'#diet-save'],
    ['exercise','/exercise/log/new','#performed-at',{},'#exercise-log-form [type=submit]']
  ]) await runtimeTest(`CAL-UI-QUICK-${kind}`,async()=>{
    await click(`[data-quick="${route}"]`);await ready(selector);
    const date=await cdp.evaluate(`document.querySelector('${selector}').value.slice(0,10)`);
    await fill(values);
    // Dynamic exercise fields reuse the selected existing template.
    if(kind==='exercise') {await ready('#dynamic-fields input');await cdp.evaluate(`document.querySelectorAll('#dynamic-fields input[type=number]').forEach((el)=>{el.value='30';el.dispatchEvent(new Event('input',{bubbles:true}));});`);}
    await click(save);await ready('[data-calendar-date="2036-05-17"]');
    await pollEvaluate(cdp,"document.querySelectorAll('[data-calendar-entry]').length",(n)=>n>0,10000);
    return date===selected && await cdp.evaluate(`location.hash==='#/calendar?date=${selected}' && document.querySelector('#calendar-results').textContent.includes('${({weight:'66.2 kg',inbody:'인바디',diet:'달력 빠른 식단',exercise:'운동기록'})[kind]}')`);
  },'Existing form defaults selected date; save returns to that date with new source event.');
  await runtimeTest('CAL-UI-02-DIRTY',async()=>{
    await click('[data-quick="/weight/log/new"]');await ready('#health-at');await fill({'#health-weight':'65'});
    await cdp.evaluate("window.confirm=()=>false;document.querySelector('#health-cancel').click()");
    const stayed=await cdp.evaluate("Boolean(document.querySelector('#health-form'))");
    await cdp.evaluate("window.confirm=()=>true;document.querySelector('#health-cancel').click()");await ready('[data-calendar-date="2036-05-17"]');
    return stayed;
  },'Dirty guard rejects discard; accepting discard returns to selected calendar date.');
  await runtimeTest('CAL-UI-03-OFFLINE',async()=>{
    const before=await cdp.evaluate("document.querySelector('#calendar-results').textContent");
    await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await cdp.evaluate('globalThis.__dashboardReloadMarker=true');await cdp.send('Page.reload');
    await pollEvaluate(cdp,'globalThis.__dashboardReloadMarker===undefined && Boolean(document.querySelector("[data-calendar-entry]"))',Boolean,20000);
    const same=await cdp.evaluate(`document.querySelector('#calendar-results').textContent===${JSON.stringify(before)}`);
    const blocked=await cdp.evaluate("fetch('offline-probe-'+Date.now(),{method:'HEAD',cache:'no-store'}).then(()=>false,()=>true)");
    await go('/home','#dashboard');const home=await cdp.evaluate("Boolean(document.querySelector('#home-weight')) && document.documentElement.scrollWidth<=innerWidth");
    await go(`/calendar?date=${selected}`,'[data-calendar-entry]');return same&&blocked&&home;
  },'Network blocked and full reload retains identical calendar; dashboard and local assets function offline.');
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  const calendarShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'tests/results/v0.8.0-unified-calendar.png'),Buffer.from(calendarShot.data,'base64'));
}

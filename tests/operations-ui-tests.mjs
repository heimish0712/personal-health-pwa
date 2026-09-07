import fs from 'node:fs';
import path from 'node:path';
export async function runOperationsUiTests({cdp,pollEvaluate,runtimeTest,root,advanceWorker}) {
 const ready=(selector)=>pollEvaluate(cdp,`Boolean(document.querySelector(${JSON.stringify(selector)}))`,Boolean,20000);
 const go=async(route,selector)=>{await cdp.evaluate(`location.hash=${JSON.stringify(route)}`);await ready(selector);};
 const click=(selector)=>cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 await go('/settings','#operations-settings');await ready('#backup-settings');
 await runtimeTest('OPS-UI-STORAGE',async()=>{
   await pollEvaluate(cdp,"document.querySelector('#portable-storage').textContent",(s)=>s.includes('MB'),15000);
   await click('#data-diagnose');await pollEvaluate(cdp,"document.querySelector('#data-diagnostic-result').textContent",(s)=>s.includes('검사')&&!s.includes('검사 중'),20000);
   return cdp.evaluate("document.querySelector('#data-diagnostic-result').textContent.startsWith('정상') && document.querySelector('#media-settings').textContent.includes('한도') && document.querySelector('#media-settings').textContent.includes('백업을 대체하지')");
 },'Settings shows quota/media/portable estimate, persistence caveat and read-only relational diagnostic.');
 await runtimeTest('OPS-UI-GC-CANCEL',async()=>{await cdp.evaluate('window.__gcConfirm=false;window.confirm=()=>{window.__gcConfirm=true;return false;}');await click('#media-gc');await pollEvaluate(cdp,'window.__gcConfirm',Boolean,10000);return cdp.evaluate("!document.querySelector('#media-action-error').textContent");},'Explicit GC preview can be cancelled before deletion.');
 await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await runtimeTest('OPS-UI-OFFLINE-DIAGNOSTIC',async()=>{await click('#data-diagnose');await pollEvaluate(cdp,"document.querySelector('#data-diagnostic-result').textContent",(s)=>s.startsWith('정상'),20000);await click('#log-refresh');return cdp.evaluate("Boolean(document.querySelector('#log-export')) && document.documentElement.scrollWidth<=innerWidth");},'Storage and data/log diagnostics work fully offline without horizontal overflow.');
 await cdp.evaluate("document.querySelector('#operations-settings').scrollIntoView({block:'start'});");
 const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'tests/results/v0.10.0-operations.png'),Buffer.from(shot.data,'base64'));
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 const snapshot=()=>cdp.evaluate(`(async()=>{const {bootstrapApplication}=await import('./js/bootstrap/bootstrap.js');return (await (await bootstrapApplication()).services.backupExport.exportCurrentProfile()).document.integrity.payloadHash;})()`);
 const before=await snapshot();await cdp.evaluate("caches.open('unrelated-app-keep');");
 await go('/weight/log/new','#health-form');await cdp.evaluate("document.querySelector('#health-weight').value='65.3';document.querySelector('#health-weight').dispatchEvent(new Event('input',{bubbles:true}));globalThis.__opsUpdateMarker=true;");
 advanceWorker();await cdp.evaluate('(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();})()');
 await pollEvaluate(cdp,'navigator.serviceWorker.getRegistration().then(r=>Boolean(r.waiting))',Boolean,30000);
 await runtimeTest('OPS-UI-UPDATE-REJECT',async()=>{await cdp.evaluate('window.confirm=()=>false;');await click('#update-now');return cdp.evaluate("document.querySelector('#health-weight').value==='65.3' && globalThis.__opsUpdateMarker===true");},'Actual waiting worker remains pending when dirty form update is rejected.');
 await runtimeTest('OPS-UI-EXTERNAL-ACTIVATION',async()=>{
   await cdp.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.waiting.postMessage({type:'SKIP_WAITING'}))");
   await pollEvaluate(cdp,"document.querySelector('#toast').textContent",(s)=>s.includes('작성 중'),30000);
   return cdp.evaluate("globalThis.__opsUpdateMarker===true && document.querySelector('#health-weight').value==='65.3' && !document.querySelector('#update-now').disabled");
 },'Real controllerchange from activation outside UI preserves mounted dirty form and offers deferred reload.');
 await runtimeTest('OPS-UI-UPDATE-APPLY',async()=>{
   await cdp.evaluate('window.confirm=()=>true;');await click('#update-now');
   await pollEvaluate(cdp,'globalThis.__opsUpdateMarker===undefined && Boolean(document.querySelector("#health-form"))',Boolean,20000);
   await go('/settings','#operations-settings');await ready('#backup-settings');
   const cachesOK=await cdp.evaluate("caches.keys().then(keys=>keys.includes('unrelated-app-keep') && keys.includes('personal-health-pwa-v0.10.0-ops-update') && !keys.includes('personal-health-pwa-v0.10.0'))");
   return cachesOK && before===await snapshot() && await cdp.evaluate("document.querySelector('.diagnostic-list').textContent.includes('정상')");
 },'Accepted reload activates new app cache, preserves unrelated cache and exact IndexedDB payload; startup diagnostic normal.');
}

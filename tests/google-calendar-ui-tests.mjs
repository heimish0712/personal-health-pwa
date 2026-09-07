import fs from 'node:fs';
import path from 'node:path';
export async function runGoogleCalendarUiTests({ cdp, pollEvaluate, runtimeTest, root }) {
  const ready = (selector) => pollEvaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, Boolean, 20000);
  const go = async (route, selector) => { await cdp.evaluate(`location.hash=${JSON.stringify(route)}`); await ready(selector); };
  await go('/settings', '#google-status');
  await runtimeTest('GCAL-UI-01-OFF', () => cdp.evaluate(`document.querySelector('#google-status').textContent.startsWith('OFF') && !document.querySelector('script[src="https://accounts.google.com/gsi/client"]')`), 'New settings defaults OFF with no GIS request.');
  // Fixture device preference only. No actual OAuth authorization is claimed by this UI test.
  await cdp.evaluate(`(async()=>{const {createContainer}=await import('./js/bootstrap/container.js');const c=createContainer();await c.bootstrapService.initialize();await c.calendarIntegrationCommand.setEnabled(c.identityContext.getCurrentProfileId(),true);c.database.close();})()`);
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await runtimeTest('GCAL-UI-02-OFFLINE-PENDING', async () => {
    await go('/exercise/schedule/new', '#schedule-form');
    await cdp.evaluate(`(()=>{for(const [id,value] of Object.entries({'#schedule-at':'2026-09-09T10:00','#schedule-duration':'50','#schedule-memo':'Google offline QA'})){const n=document.querySelector(id);n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('#schedule-form').requestSubmit();})()`);
    await ready('#calendar-grid');
    const notice = await cdp.evaluate("document.querySelector('#toast').textContent.includes('예약은 저장됐지만 Google Calendar 반영은 대기 중')");
    await go('/settings', '#google-status');
    await pollEvaluate(cdp,"document.querySelector('#google-status').textContent", s=>s.includes('대기 1건'),20000);
    return notice && await cdp.evaluate("document.querySelector('#google-status').textContent.includes('재인증 필요')");
  }, 'Actual offline form commits schedule and queue and shows the saved-but-pending notice.');
  await runtimeTest('GCAL-UI-03-RELAUNCH', async () => {
    await cdp.send('Page.reload'); await ready('#google-status');
    await pollEvaluate(cdp,"document.querySelector('#google-status').textContent", s=>s.includes('대기 1건'),20000);
    await cdp.evaluate("document.querySelector('#google-retry').click()");
    await pollEvaluate(cdp,"document.querySelector('#google-error').textContent", s=>s.includes('오프라인'),10000);
    return cdp.evaluate("document.querySelector('#google-status').textContent.startsWith('ON') && document.documentElement.scrollWidth<=innerWidth");
  }, 'Offline reload retains ON/pending, no session token, and explicit retry explains offline state.');
  await cdp.evaluate("document.querySelector('#google-calendar-settings').scrollIntoView({block:'start'})");
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(root,'tests/results/v0.10.0-google-calendar.png'), Buffer.from(shot.data,'base64'));
  await runtimeTest('GCAL-UI-04-DISABLE', async () => {
    await cdp.evaluate("document.querySelector('#google-off').click()");
    await pollEvaluate(cdp,"document.querySelector('#google-status').textContent", s=>s.startsWith('OFF'),10000);
    return cdp.evaluate("document.querySelector('#google-status').textContent.includes('대기 1건')");
  }, 'OFF button preserves pending history and stops new dispatch.');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}

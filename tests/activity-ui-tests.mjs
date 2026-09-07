export async function runActivityUiTests({ cdp, pollEvaluate, runtimeTest }) {
  const ready = (selector) => pollEvaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, Boolean, 10000);
  const go = async (route, selector) => { await cdp.evaluate(`location.hash = ${JSON.stringify(route)}`); await ready(selector); };
  const fill = (values) => cdp.evaluate(`(() => { for (const [selector, value] of Object.entries(${JSON.stringify(values)})) { const node = document.querySelector(selector); node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  const click = (selector) => cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const snapshot = () => cdp.evaluate(`(async () => { const { bootstrapApplication } = await import('./js/bootstrap/bootstrap.js'); const app = await bootstrapApplication(); return (await app.services.backupExport.exportCurrentProfile()).document; })()`);
  let typeId, passId, logId, scheduleId;
  await runtimeTest('ACTIVITY-UI-PASS', async () => {
    await go('/exercise/pass/new', '#pass-form');
    typeId = await cdp.evaluate("document.querySelector('#pass-type').value");
    await fill({ '#pass-name': 'UI 60회', '#pass-count': '60', '#pass-start': '2026-01-01', '#pass-expiry': '2026-12-31' });
    await click('#pass-form [type=submit]'); await ready('#new-pass');
    const doc = await snapshot(); passId = doc.data.passes.find((p) => p.name === 'UI 60회')?.id;
    return Boolean(passId) && await cdp.evaluate("document.body.textContent.includes('잔여 60 / 60회')");
  }, 'Offline pass form saves a 60-use pass and displays calculated remaining.');
  await runtimeTest('ACTIVITY-UI-LOG', async () => {
    await go('/exercise/log/new', '#exercise-pass');
    await pollEvaluate(cdp, `Boolean(document.querySelector('#exercise-pass option[value="${passId}"]'))`, Boolean, 10000);
    await fill({ '#performed-at': '2026-09-07T10:00', '#exercise-pass': passId, '#exercise-memo': 'UI 운동' });
    await click('#exercise-log-form [type=submit]'); await ready('#edit-log');
    const doc = await snapshot(); logId = doc.data.exercise_logs.find((l) => l.memo === 'UI 운동')?.id;
    return doc.data.pass_usage_logs.filter((u) => u.pass_id === passId && u.status === 'used').length === 1 && await cdp.evaluate("document.body.textContent.includes('잔여 59회')");
  }, 'Offline exercise form selects pass and detail shows 59 remaining.');
  await runtimeTest('ACTIVITY-UI-UNLINK', async () => {
    await click('#edit-log'); await ready('#exercise-log-edit-form');
    await fill({ '#exercise-pass': '' }); await click('#exercise-log-edit-form [type=submit]'); await ready('#edit-log');
    const doc = await snapshot(); return doc.data.pass_usage_logs.find((u) => u.exercise_log_id === logId).status === 'cancelled';
  }, 'Edit UI can remove debit without deleting historical usage.');
  await runtimeTest('ACTIVITY-UI-SCHEDULE', async () => {
    await go('/exercise/schedule/new', '#schedule-form');
    await fill({ '#schedule-type': typeId, '#schedule-at': '2026-09-07T11:00', '#schedule-duration': '50', '#schedule-memo': 'UI 예약' });
    await click('#schedule-form [type=submit]'); await ready('#calendar-grid');
    const doc = await snapshot(); scheduleId = doc.data.exercise_schedules.find((s) => s.memo === 'UI 예약')?.id;
    return Boolean(scheduleId) && doc.data.pass_usage_logs.filter((u) => u.pass_id === passId && u.status === 'used').length === 0;
  }, 'Offline schedule form saves without any charge.');
  await runtimeTest('ACTIVITY-UI-COMPLETE', async () => {
    await go(`/exercise/schedule/${scheduleId}/edit`, '#complete-schedule'); await click('#complete-schedule'); await ready('#exercise-pass');
    await fill({ '#exercise-pass': passId });
    await cdp.evaluate("document.querySelector('#schedule-form').requestSubmit(); document.querySelector('#schedule-form').requestSubmit()");
    await ready('#calendar-grid');
    const doc = await snapshot(); const schedule = doc.data.exercise_schedules.find((s) => s.id === scheduleId);
    return schedule.status === 'completed' && doc.data.pass_usage_logs.filter((u) => u.pass_id === passId && u.status === 'used').length === 1;
  }, 'Double-submit completion UI commits exactly one log and one debit offline.');
  await runtimeTest('ACTIVITY-UI-UNDO', async () => {
    await go(`/exercise/schedule/${scheduleId}/edit`, '#undo-schedule');
    await cdp.evaluate('window.confirm = () => true'); await click('#undo-schedule'); await ready('#calendar-grid');
    const doc = await snapshot(); return doc.data.exercise_schedules.find((s) => s.id === scheduleId).status === 'scheduled' && doc.data.pass_usage_logs.filter((u) => u.pass_id === passId && u.status === 'used').length === 0;
  }, 'Completed schedule UI undo returns remaining to 60.');
  await runtimeTest('ACTIVITY-UI-RECOMPLETE', async () => {
    await go(`/exercise/schedule/${scheduleId}/complete`, '#exercise-pass'); await fill({ '#exercise-pass': passId }); await click('#schedule-form [type=submit]'); await ready('#calendar-grid');
    const before = await snapshot(); await cdp.send('Page.reload'); await ready('#calendar-grid');
    const after = await snapshot(); return before.integrity.payloadHash === after.integrity.payloadHash && after.data.pass_usage_logs.filter((u) => u.pass_id === passId && u.status === 'used').length === 1;
  }, 'Re-complete then offline app reload preserves exact data hash and 59 remaining.');
  await runtimeTest('ACTIVITY-UI-MOBILE', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true });
    await go('/exercise/passes', '#new-pass');
    return cdp.evaluate('document.documentElement.scrollWidth <= innerWidth && document.body.textContent.includes("잔여 59 / 60회")');
  }, '412px mobile viewport shows pass balance without horizontal overflow (not real-device QA).');
}

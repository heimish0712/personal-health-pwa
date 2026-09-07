export async function runHealthUiTests({ cdp, pollEvaluate, runtimeTest }) {
  const ready = (selector) => pollEvaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, Boolean, 20000);
  const click = (selector) => cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const go = async (route, selector) => { await cdp.evaluate(`location.hash = ${JSON.stringify(route)}`); await ready(selector); };
  const fill = async (values) => cdp.evaluate(`(() => { for (const [id, value] of Object.entries(${JSON.stringify(values)})) { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = value; else el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  const snapshot = () => cdp.evaluate(`(async () => { const { bootstrapApplication } = await import('./js/bootstrap/bootstrap.js'); const app = await bootstrapApplication(); return (await app.services.backupExport.exportCurrentProfile()).document; })()`);
  const today = await cdp.evaluate(`(async () => { const { nowLocalInput } = await import('./js/core/datetime.js'); return nowLocalInput('Asia/Seoul').slice(0,10); })()`);
  // navigator.onLine can remain true with CDP emulation; prove an uncached
  // HEAD request (not intercepted by this app's GET-only worker) cannot reach server.
  const networkBlocked = () => cdp.evaluate(`(async () => { try { await fetch('./index.html?health-offline-probe=' + Date.now(), { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(5000) }); return false; } catch (e) { return e.name === 'TypeError'; } })()`);
  let weightId, inbodyId, linkedId;
  await runtimeTest('HEALTH-UI-01-OFFLINE-CREATE', async () => {
    if (!await networkBlocked()) throw new Error('Offline emulation did not block an uncached network request.');
    await go('/weight', '#health-period'); await go('/weight/log/new', '#health-form');
    await fill({ 'health-at': `${today}T08:00`, 'health-weight': '70', 'health-memo': 'QA 체중 아침 <img src=x onerror=alert(1)>' });
    await click('#health-save'); await ready('#health-edit'); const doc = await snapshot(); weightId = doc.data.weight_logs[0]?.id;
    return doc.data.weight_logs.length === 1 && doc.data.weight_logs[0].weight === 70 && !await cdp.evaluate('Boolean(document.querySelector("#page-root img"))');
  }, 'Offline actual form creates manual weight; memo is escaped.');
  await runtimeTest('HEALTH-UI-02-OFFLINE-INBODY', async () => {
    await go('/weight/inbody/new', '#health-form'); await fill({ 'health-at': `${today}T09:00`, 'health-weight': '69.5', 'health-skeletal_muscle_mass': '30', 'health-body_fat_mass': '17', 'health-body_fat_percentage': '24.5', 'health-bmi': '23.2', 'health-visceral_fat_level': '7', 'health-basal_metabolic_rate': '1520', 'health-memo': 'QA 인바디', 'health-link': true });
    await click('#health-save'); await ready('#health-edit'); const doc = await snapshot(); inbodyId = doc.data.inbody_logs[0]?.id; linkedId = doc.data.weight_logs.find((r) => r.source_ref_id === inbodyId)?.id;
    return Boolean(inbodyId && linkedId) && doc.data.weight_logs.length === 2;
  }, 'Offline InBody form creates atomic pair with seven metrics.');
  await runtimeTest('HEALTH-UI-03-LINK-REDIRECT', async () => {
    await go(`/weight/log/${linkedId}/edit`, '#health-form');
    return await cdp.evaluate(`location.hash === '#/weight/inbody/${inbodyId}/edit' && Boolean(document.querySelector('#health-link'))`);
  }, 'Direct linked-weight edit routes to authoritative InBody form.');
  await runtimeTest('HEALTH-UI-04-SYNC-OFF-ON', async () => {
    await fill({ 'health-weight': '69', 'health-at': `${today}T09:30`, 'health-memo': 'QA 동기화' }); await click('#health-save'); await ready('#health-edit');
    let doc = await snapshot(), linked = doc.data.weight_logs.find((r) => r.id === linkedId);
    if (linked.weight !== 69 || linked.memo !== 'QA 동기화') return false;
    await click('#health-edit'); await ready('#health-form'); await fill({ 'health-link': false }); await click('#health-save'); await ready('#health-edit');
    if (!(await snapshot()).data.weight_logs.find((r) => r.id === linkedId).deleted_at) return false;
    await click('#health-edit'); await ready('#health-form'); await fill({ 'health-link': true }); await click('#health-save'); await ready('#health-edit');
    doc = await snapshot(); return doc.data.weight_logs.length === 2 && doc.data.weight_logs.find((r) => r.id === linkedId).deleted_at === null;
  }, 'Actual UI syncs pair, OFF deletes, ON reuses the original row.');
  await runtimeTest('HEALTH-UI-05-DELETE-RESTORE', async () => {
    await cdp.evaluate('window.confirm = () => true'); await click('#health-delete'); await ready('#health-restore');
    let doc = await snapshot(); if (!doc.data.inbody_logs[0].deleted_at || !doc.data.weight_logs.find((r) => r.id === linkedId).deleted_at) return false;
    await click('#health-restore'); await ready('#health-edit'); doc = await snapshot();
    return doc.data.inbody_logs[0].deleted_at === null && doc.data.weight_logs.find((r) => r.id === linkedId).deleted_at === null;
  }, 'Offline UI delete/restore maintains both records.');
  await runtimeTest('HEALTH-UI-06-GRAPH', async () => {
    await go('/weight', '#health-period'); await ready('svg.health-graph');
    if (!(await cdp.evaluate("document.querySelectorAll('[data-point]').length === 2 && document.querySelector('#latest-weight').textContent.includes('-1 kg')"))) return false;
    for (const metric of ['skeletal_muscle_mass', 'body_fat_mass', 'body_fat_percentage', 'bmi', 'visceral_fat_level', 'basal_metabolic_rate']) {
      await fill({ 'health-metric': metric }); await pollEvaluate(cdp, "document.querySelector('svg title')?.textContent ?? ''", (v) => !v.startsWith('체중 '), 10000);
      await pollEvaluate(cdp, "document.querySelectorAll('[data-point]').length", (v) => v === 1, 10000);
    }
    await fill({ 'health-metric': 'weight', 'health-period': 'all' }); await pollEvaluate(cdp, "document.querySelectorAll('[data-point]').length", (v) => v === 2, 10000);
    return await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth');
  }, 'Offline seven-metric SVG and same-day points render without mobile horizontal overflow.');
  await runtimeTest('HEALTH-UI-07-CALENDAR-HOME', async () => {
    await go('/calendar', '[data-calendar-date]'); await ready('[data-health-route]');
    if (!(await cdp.evaluate("document.querySelectorAll('[data-calendar-entry]').length === 2 && document.querySelector('#calendar-results').textContent.includes('인바디 · 체중 연동')"))) return false;
    await go('/home', '#home-health'); return await cdp.evaluate("document.querySelector('#home-health').textContent.includes('69 kg') && document.querySelector('#home-health').textContent.includes('골격근량 30')");
  }, 'Calendar combines linked pair; home shows latest weight, delta and InBody metrics.');
  await runtimeTest('HEALTH-UI-08-OFFLINE-RELOAD', async () => {
    const before = await snapshot(); await cdp.evaluate('globalThis.__healthReloadMarker = true'); await cdp.send('Page.reload', { ignoreCache: false });
    await pollEvaluate(cdp, 'globalThis.__healthReloadMarker === undefined && Boolean(document.querySelector("#home-health"))', Boolean, 20000);
    const after = await snapshot(); const blocked = await networkBlocked();
    if (before.integrity.payloadHash !== after.integrity.payloadHash || !blocked) throw new Error(JSON.stringify({ before: before.integrity.payloadHash, after: after.integrity.payloadHash, networkBlocked: blocked })); return true;
  }, 'Offline PWA relaunch preserves exact portable payload including measurements.');
  await runtimeTest('HEALTH-UI-09-MANUAL-EDIT-DELETE-RESTORE', async () => {
    await go(`/weight/log/${weightId}/edit`, '#health-form'); await fill({ 'health-weight': '70.2' }); await click('#health-save'); await ready('#health-edit');
    await cdp.evaluate('window.confirm = () => true'); await click('#health-delete'); await ready('#health-restore'); await click('#health-restore'); await ready('#health-edit');
    return (await snapshot()).data.weight_logs.find((r) => r.id === weightId).weight === 70.2;
  }, 'Manual weight actual edit/delete/restore works after offline reload.');
  await go('/weight', '#health-period'); await ready('svg.health-graph');
}

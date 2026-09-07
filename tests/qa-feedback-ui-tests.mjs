import fs from 'node:fs';
import path from 'node:path';
export async function runQaFeedbackUiTests({ cdp, pollEvaluate, runtimeTest, profileDirectory, root }) {
  const ready = (selector) => pollEvaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, Boolean, 15000);
  const click = (selector) => cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const snapshot = () => cdp.evaluate(`(async () => { const { bootstrapApplication } = await import('./js/bootstrap/bootstrap.js'); const app = await bootstrapApplication(); return (await app.services.backupExport.exportCurrentProfile()).document; })()`);
  const selectFile = async (selector, doc) => cdp.evaluate(`(() => { const d = new DataTransfer(); d.items.add(new File([${JSON.stringify(JSON.stringify(doc))}], 'saved-backup.json', { type: 'application/json' })); const input = document.querySelector(${JSON.stringify(selector)}); input.files = d.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await cdp.evaluate("location.hash = '/calendar'"); await ready('[data-calendar-date]');
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(root, 'tests/results/v0.6.0-calendar.png'), Buffer.from(shot.data, 'base64'));
  await cdp.evaluate("location.hash = '/settings'"); await ready('#data-reset');
  const original = await snapshot(); let downloaded;
  await runtimeTest('QA051-23-OFFLINE-BACKUP-RESET', async () => {
    await click('#data-reset'); await click('#data-backup-first'); await ready('#replacement-file');
    // Receiving an anchor click does not imply the browser saved a file: verify actual disk download.
    await pollEvaluate(cdp, "document.querySelector('#backup-settings').getAttribute('aria-busy')", (v) => v === 'false', 10000);
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline && !downloaded) {
      for (const filename of fs.readdirSync(profileDirectory).filter((f) => f.endsWith('.json'))) {
        try { const d = JSON.parse(fs.readFileSync(path.join(profileDirectory, filename), 'utf8')); if (d.integrity?.payloadHash === original.integrity.payloadHash) { downloaded = d; break; } } catch {}
      }
      if (!downloaded) await new Promise((r) => setTimeout(r, 100));
    }
    if (!downloaded || (await snapshot()).integrity.payloadHash !== original.integrity.payloadHash) return false;
    await selectFile('#replacement-file', downloaded);
    await pollEvaluate(cdp, "document.querySelector('.diagnostic-list')?.textContent ?? ''", (v) => !v.includes(original.scope.profileId.slice(0,8)) && v.includes('정상'), 15000);
    await ready('#data-reset'); const after = await snapshot();
    return after.counts.profiles === 1 && after.counts.exercise_types === 1 && after.counts.exercise_templates === 1 && after.counts.exercise_logs === 0 && after.counts.passes === 0;
  }, 'Offline UI backup writes a real downloaded file; validated file read-back gates reset; initial seed reloads.');
  await runtimeTest('QA051-23-OFFLINE-FORCE', async () => {
    await cdp.evaluate(`(async () => { const { bootstrapApplication } = await import('./js/bootstrap/bootstrap.js'); const app = await bootstrapApplication(); await app.services.exerciseManagement.createExerciseType({ name: '교체 대상', fields: [] }); })()`);
    await selectFile('#backup-file', original); await ready('#backup-force');
    if (!(await cdp.evaluate("document.querySelector('#backup-confirm').disabled"))) return false;
    await click('#backup-force'); await cdp.evaluate('window.confirm = () => true'); await click('#data-without-backup');
    await pollEvaluate(cdp, "document.querySelector('.diagnostic-list')?.textContent ?? ''", (v) => v.includes(original.scope.profileId.slice(0,8)), 15000);
    await ready('#data-reset'); return (await snapshot()).integrity.payloadHash === original.integrity.payloadHash;
  }, 'Offline populated target keeps normal restore blocked; explicit no-backup forced replace reloads with exact original hash.');
  await runtimeTest('QA051-OFFLINE-NO-BACKUP-RESET', async () => {
    await click('#data-reset'); await cdp.evaluate('window.confirm = () => true'); await click('#data-without-backup');
    await pollEvaluate(cdp, "document.querySelector('.diagnostic-list')?.textContent ?? ''", (v) => !v.includes(original.scope.profileId.slice(0,8)) && v.includes('정상'), 15000);
    await ready('#data-reset'); return (await snapshot()).counts.passes === 0;
  }, 'Offline no-backup reset requires final confirmation and recreates initial state.');
}

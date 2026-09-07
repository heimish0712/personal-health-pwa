import { runActivityUiTests } from './activity-ui-tests.mjs';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(process.cwd());
const outputPath = path.join(root, 'tests/results/v0.5.0-browser.json');
const basePath = '/personal-health-pwa-v0.5.0/';
const suiteName = 'browser-runtime';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8'
};

function findBrowser() {
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.PROGRAMFILES;
  const programFilesX86 = process.env['PROGRAMFILES(X86)'];
  const candidates = [
    process.env.CHROME_BIN,
    process.env.CHROMIUM_BIN,
    '/usr/lib/chromium/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    localAppData && path.join(localAppData, 'Google/Chrome/Application/chrome.exe'),
    localAppData && path.join(localAppData, 'Microsoft/Edge/Application/msedge.exe'),
    programFiles && path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
    programFiles && path.join(programFiles, 'Microsoft/Edge/Application/msedge.exe'),
    programFilesX86 && path.join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
    programFilesX86 && path.join(programFilesX86, 'Microsoft/Edge/Application/msedge.exe')
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withTimeout(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function writeResult(result) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function writeNotRun(id, evidence) {
  const result = {
    version: '0.5.0',
    suite: suiteName,
    executedAt: new Date().toISOString(),
    summary: { total: 1, passed: 0, failed: 0, notRun: 1 },
    cases: [{ id, status: 'NOT_RUN', evidence }]
  };
  writeResult(result);
  console.log(`NOT_RUN ${id} - ${evidence}`);
}

async function waitForDevToolsPort(profileDirectory, child) {
  const portFile = path.join(profileDirectory, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    if (fs.existsSync(portFile)) {
      const [port] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
      return Number(port);
    }
    if (child.exitCode != null) {
      throw new Error(`Browser exited before DevTools became available: ${child.exitCode}`);
    }
    await wait(100);
  }

  throw new Error('Timed out waiting for the browser DevTools port.');
}

async function findPageTarget(port) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Browser endpoint may not be ready yet.
    }
    await wait(100);
  }
  throw new Error('No debuggable page target was found.');
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket connection timed out.')), 10000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('CDP WebSocket connection failed.'));
      }, { once: true });
    });

    this.socket.addEventListener('message', async (event) => {
      let payload = event.data;
      if (payload instanceof Blob) payload = await payload.text();
      if (payload instanceof ArrayBuffer) payload = new TextDecoder().decode(payload);
      const message = JSON.parse(String(payload));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime evaluation failed.');
    }
    return result.result?.value;
  }

  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('CDP connection closed.'));
    }
    this.pending.clear();
    this.socket?.close();
  }
}

async function pollEvaluate(cdp, expression, predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      lastValue = await cdp.evaluate(expression);
      if (predicate(lastValue)) return lastValue;
      lastError = null;
    } catch (error) {
      // Navigation can temporarily destroy the execution context.
      lastError = error;
    }
    await wait(100);
  }

  throw new Error(`Timed out waiting for browser state. Last value: ${JSON.stringify(lastValue)}${lastError ? `; ${lastError.message}` : ''}`);
}

function stopBrowser(child) {
  if (!child || child.exitCode != null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

async function closeServer(server) {
  if (!server?.listening) return;
  server.closeAllConnections?.();
  await Promise.race([
    new Promise((resolve) => server.close(resolve)),
    wait(2000)
  ]);
}

function isAdministrativeBlock(snapshot) {
  const text = `${snapshot?.href ?? ''}\n${snapshot?.body ?? ''}`;
  return snapshot?.href?.startsWith('chrome-error://')
    || /ERR_BLOCKED_BY_ADMINISTRATOR|blocked by (your )?administrator/i.test(text);
}

function makeRuntimeRecorder(cases) {
  return async function runtimeTest(id, callback, evidence) {
    try {
      const value = await callback();
      const pass = value === undefined ? true : Boolean(value);
      cases.push({ id, status: pass ? 'PASS' : 'FAIL', evidence: pass ? evidence : 'Returned false.' });
    } catch (error) {
      cases.push({ id, status: 'FAIL', evidence: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}` });
    }
  };
}

const browser = findBrowser();
if (!browser) {
  writeNotRun('BROWSER-ENV', 'Chrome, Chromium, or Edge executable was not found.');
  process.exit(0);
}
if (typeof WebSocket !== 'function') {
  writeNotRun('BROWSER-ENV', 'This Node.js runtime does not provide the WebSocket API required by the dependency-free CDP runner.');
  process.exit(0);
}

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);

  if (requestPath === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }

  if (!requestPath.startsWith(basePath)) {
    response.writeHead(404).end('Not found');
    return;
  }

  const relativePath = requestPath.slice(basePath.length) || 'index.html';
  const filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== path.join(root, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(content);
  });
});

let child = null;
let cdp = null;
let profileDirectory = null;
let networkOffline = false;

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'health-pwa-browser-test-'));
  const origin = `http://127.0.0.1:${address.port}`;
  const dbTestUrl = `${origin}${basePath}tests/browser/db-test.html`;
  const appUrl = `${origin}${basePath}index.html#/home`;
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDirectory}`,
    dbTestUrl
  ];
  if (process.platform !== 'win32') args.unshift('--no-sandbox');

  child = spawn(browser, args, {
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore']
  });

  await withTimeout((async () => {
    const port = await waitForDevToolsPort(profileDirectory, child);
    const pageTarget = await findPageTarget(port);
    cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');

    const initialState = await pollEvaluate(
      cdp,
      `({
        status: document.body?.dataset?.status ?? null,
        href: location.href,
        body: document.body?.innerText?.slice(0, 1200) ?? ''
      })`,
      (state) => state?.status === 'done' || isAdministrativeBlock(state),
      60000
    );
    if (isAdministrativeBlock(initialState)) {
      writeNotRun('BROWSER-POLICY', 'The installed browser blocked the local test URL by administrative policy.');
      return;
    }

    const dbResultText = await cdp.evaluate("document.querySelector('#test-result')?.textContent ?? ''");
    const dbResult = JSON.parse(dbResultText);
    const backupUiDocument = await cdp.evaluate('globalThis.__BACKUP_TEST_DOCUMENT__ ?? null');
    const runtimeCases = [];
    const runtimeTest = makeRuntimeRecorder(runtimeCases);

    await cdp.evaluate(`(async () => {
      const legacyCache = await caches.open('personal-health-pwa-v0.4.0');
      await legacyCache.put(
        '${origin}${basePath}legacy-cache-marker',
        new Response('legacy')
      );
      const unrelatedCache = await caches.open('unrelated-app-cache');
      await unrelatedCache.put(
        '${origin}${basePath}unrelated-cache-marker',
        new Response('unrelated')
      );
      return true;
    })()`);

    await cdp.send('Page.navigate', { url: appUrl });
    await pollEvaluate(
      cdp,
      `({
        title: document.querySelector('#page-title')?.textContent ?? '',
        body: document.body?.innerText ?? ''
      })`,
      (value) => value?.title === '홈' && value.body.includes('v0.5.0 · DB 1'),
      30000
    );

    await runtimeTest('PWA-LOCAL-001', async () => {
      const value = await cdp.evaluate(`({
        title: document.querySelector('#page-title')?.textContent ?? '',
        body: document.body?.innerText ?? '',
        pathname: location.pathname
      })`);
      return value.title === '홈'
        && value.body.includes('로컬 우선 데이터 기반 준비 완료')
        && value.pathname.startsWith(basePath);
    }, 'The application boots successfully from a GitHub Pages-style repository subpath.');

    await runtimeTest('MANIFEST-RUNTIME-001', async () => cdp.evaluate(`(() => {
      const manifest = document.querySelector('link[rel="manifest"]');
      return Boolean(manifest)
        && manifest.href.endsWith('${basePath}manifest.json');
    })()`), 'The manifest resolves inside the repository subpath.');

    const parsedManifest = await cdp.send('Page.getAppManifest');
    await runtimeTest('MANIFEST-RUNTIME-002', () => (
      Array.isArray(parsedManifest.errors)
      && parsedManifest.errors.length === 0
      && parsedManifest.parsed?.scope?.endsWith(basePath)
      && parsedManifest.manifest?.display === 'kStandalone'
    ), 'Chromium parses the manifest without errors and resolves standalone scope to the repository subpath.');

    await runtimeTest('NAV-RUNTIME-001', async () => cdp.evaluate(`(() => {
      const labels = [...document.querySelectorAll('#bottom-nav .nav-item')]
        .map((item) => item.textContent.trim().replace(/\\s+/g, ' '));
      return labels.length === 5
        && ['홈', '캘린더', '운동', '식단', '체중'].every((label) => labels.some((item) => item.endsWith(label)));
    })()`), 'All five approved bottom navigation tabs render.');

    await runtimeTest('NAV-RUNTIME-002', async () => {
      await cdp.evaluate("document.querySelector('a[href=\"#/exercise\"]')?.click()");
      const value = await pollEvaluate(
        cdp,
        `({ hash: location.hash, title: document.querySelector('#page-title')?.textContent ?? '' })`,
        (state) => state?.hash === '#/exercise' && state.title === '운동',
        10000
      );
      return value.hash === '#/exercise';
    }, 'Hash routing changes the active page without a server route.');

    await runtimeTest('EX-UI-RUNTIME-001', async () => {
      await cdp.send('Page.navigate', { url: `${origin}${basePath}index.html#/exercise` });
      const value = await pollEvaluate(
        cdp,
        `({ title: document.querySelector('#page-title')?.textContent ?? '', body: document.body?.innerText ?? '' })`,
        (state) => state?.title === '운동' && state.body.includes('필라테스') && state.body.includes('+ 운동 기록'),
        15000
      );
      return value.title === '운동';
    }, 'Exercise main page renders the default Pilates seed and actual record controls.');

    await runtimeTest('EX-UI-RUNTIME-002', async () => {
      await cdp.evaluate("document.querySelector('#exercise-type-add')?.click()");
      const value = await pollEvaluate(
        cdp,
        `({ hash: location.hash, title: document.querySelector('#page-title')?.textContent ?? '', body: document.body?.innerText ?? '' })`,
        (state) => state?.hash === '#/exercise/type/new' && state.title === '새 운동' && state.body.includes('기록 양식'),
        10000
      );
      return value.hash === '#/exercise/type/new';
    }, 'Exercise type creation route and dynamic template editor render.');

    await runtimeTest('EX-UI-RUNTIME-003', async () => cdp.evaluate(`(() => {
      const labels = [...document.querySelectorAll('[data-standard-field]')].map((node) => node.dataset.standardField);
      return ['duration_minutes', 'distance_km', 'steps', 'pace', 'calories'].every((key) => labels.includes(key));
    })()`), 'Exercise template editor is data-driven from the approved field catalog.');

    await runtimeTest('DIAG-RUNTIME-001', async () => {
      await cdp.evaluate("document.querySelector('#settings-button')?.click()");
      const value = await pollEvaluate(
        cdp,
        `({ title: document.querySelector('#page-title')?.textContent ?? '', body: document.body?.innerText ?? '' })`,
        (state) => state?.title === '설정' && state.body.includes('14 / 14') && state.body.includes('연결됨'),
        15000
      );
      return value.body.includes('DB Version') && value.body.includes('Schema Version');
    }, 'The read-only settings diagnostic reports 14/14 stores and a connected Profile.');

    const serviceWorkerState = await cdp.evaluate(`(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const registration = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 5000);
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      }
      return {
        supported: true,
        active: Boolean(registration.active),
        controlled: Boolean(navigator.serviceWorker.controller),
        scope: registration.scope
      };
    })()`);
    await runtimeTest('SW-RUNTIME-001', () => (
      serviceWorkerState.supported
      && serviceWorkerState.active
      && serviceWorkerState.controlled
      && serviceWorkerState.scope.endsWith(basePath)
    ), 'The Service Worker activates and controls the GitHub Pages-style scope.');

    await runtimeTest('CACHE-RUNTIME-LOCAL-001', async () => {
      const keys = await cdp.evaluate('(async () => await caches.keys())()');
      return Array.isArray(keys) && keys.includes('personal-health-pwa-v0.5.0');
    }, 'The v0.5.0 App Shell cache exists.');

    await runtimeTest('CACHE-RUNTIME-LOCAL-002', async () => {
      const keys = await cdp.evaluate('(async () => await caches.keys())()');
      return Array.isArray(keys)
        && !keys.includes('personal-health-pwa-v0.4.0')
        && keys.includes('unrelated-app-cache');
    }, 'Activation removes the simulated v0.4.0 App Shell cache without clearing unrelated cache names.');

    await cdp.send('Page.navigate', { url: appUrl });
    await pollEvaluate(
      cdp,
      `document.querySelector('#page-title')?.textContent ?? ''`,
      (title) => title === '홈',
      15000
    );

    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
      connectionType: 'none'
    });
    networkOffline = true;
    await cdp.send('Page.reload');

    await runtimeTest('OFFLINE-RUNTIME-001', async () => {
      const value = await pollEvaluate(
        cdp,
        `({ title: document.querySelector('#page-title')?.textContent ?? '', body: document.body?.innerText ?? '' })`,
        (state) => state?.title === '홈' && state.body.includes('v0.5.0 · DB 1'),
        30000
      );
      return value.body.includes('로컬 데이터 저장소') && value.body.includes('정상');
    }, 'The cached App Shell and IndexedDB-backed home screen reload while network access is disabled.');

    await runtimeTest('OFFLINE-DIAG-001', async () => {
      await cdp.evaluate("document.querySelector('#settings-button')?.click()");
      const value = await pollEvaluate(
        cdp,
        `({ title: document.querySelector('#page-title')?.textContent ?? '', body: document.body?.innerText ?? '' })`,
        (state) => state?.title === '설정' && state.body.includes('14 / 14'),
        15000
      );
      return value.body.includes('Current Profile') && value.body.includes('연결됨');
    }, 'The Profile and 14-store diagnostic remain available offline.');

    // All UI backup flows run offline in this disposable browser profile.
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: profileDirectory });
    await runtimeTest('BACKUP-UI-EXPORT', async () => {
      await cdp.evaluate("document.querySelector('#backup-export').click()");
      await pollEvaluate(cdp, "document.querySelector('#backup-status')?.textContent ?? ''", (value) => value.includes('백업을 생성했습니다.'), 10000);
      const deadline = Date.now() + 10000;
      let downloaded;
      while (Date.now() < deadline) {
        downloaded = fs.readdirSync(profileDirectory).find((name) => /^personal-health-backup-v1-.*\.json$/.test(name));
        if (downloaded) break;
        await wait(100);
      }
      if (!downloaded) return false;
      const doc = JSON.parse(fs.readFileSync(path.join(profileDirectory, downloaded), 'utf8'));
      return doc.format === 'personal-health-pwa-backup' && doc.counts.profiles === 1 && doc.integrity.payloadHash.length === 64;
    }, 'Offline settings export downloads an actual JSON file in the disposable browser profile.');

    const selectBackup = async () => {
      if (!backupUiDocument) throw new Error('Synthetic backup fixture unavailable.');
      await cdp.evaluate(`(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([${JSON.stringify(JSON.stringify(backupUiDocument))}], 'synthetic.backup.json', { type: 'application/json' }));
        const input = document.querySelector('#backup-file');
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      return pollEvaluate(cdp, `({ preview: Boolean(document.querySelector('#backup-confirm')), busy: document.querySelector('#backup-settings')?.getAttribute('aria-busy'), disabled: document.querySelector('#backup-confirm')?.disabled, text: document.querySelector('#backup-status')?.textContent })`, (state) => state.preview && state.busy === 'false', 10000);
    };
    await runtimeTest('BACKUP-UI-PRISTINE-PREVIEW', async () => !(await selectBackup()).disabled, 'Valid file previews on the seeded target and enables restore.');
    await runtimeTest('BACKUP-UI-OFFLINE-RESTORE', async () => {
      await cdp.evaluate("document.querySelector('#backup-confirm').click()");
      const result = await pollEvaluate(cdp, `({ profile: document.querySelector('.diagnostic-list')?.textContent ?? '', ready: Boolean(document.querySelector('#backup-settings')) })`, (state) => state.ready && state.profile.includes(backupUiDocument.scope.profileId.slice(0, 8)), 15000);
      return result.ready;
    }, 'Offline UI restore commits, verifies and reloads with the original Profile ID.');
    await runtimeTest('BACKUP-UI-POPULATED-PREVIEW', async () => (await selectBackup()).disabled, 'Same valid file is previewable on populated data but restore is disabled.');
    await runtimeTest('BACKUP-UI-RESTORED-HASH', async () => {
      const hash = await cdp.evaluate(`(async () => {
        const { bootstrapApplication } = await import('./js/bootstrap/bootstrap.js');
        const app = await bootstrapApplication();
        const exported = await app.services.backupExport.exportCurrentProfile();
        return exported.document.integrity.payloadHash;
      })()`);
      return hash === backupUiDocument.integrity.payloadHash;
    }, 'After offline UI reload, full portable payload hash still matches the imported file.');

    await runActivityUiTests({ cdp, pollEvaluate, runtimeTest });
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(root, 'tests/results/v0.5.0-mobile.png'), Buffer.from(screenshot.data, 'base64'));

    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: 'none'
    });
    networkOffline = false;

    const cases = [...dbResult.cases, ...runtimeCases];
    const passed = cases.filter((item) => item.status === 'PASS').length;
    const failed = cases.filter((item) => item.status === 'FAIL').length;
    const notRun = cases.filter((item) => item.status === 'NOT_RUN').length;
    const result = {
      version: '0.5.0',
      suite: suiteName,
      executedAt: new Date().toISOString(),
      userAgent: await cdp.evaluate('navigator.userAgent'),
      basePath,
      summary: { total: cases.length, passed, failed, notRun },
      cases
    };
    writeResult(result);

    for (const item of cases) {
      console.log(`${item.status} ${item.id} - ${item.evidence}`);
    }
    console.log(`\n${suiteName}: TOTAL ${cases.length} / PASS ${passed} / FAIL ${failed} / NOT_RUN ${notRun}`);
    if (failed > 0) process.exitCode = 1;
  })(), 120000, 'Browser runtime suite exceeded the 120 second hard limit.');
} catch (error) {
  const result = {
    version: '0.5.0',
    suite: suiteName,
    executedAt: new Date().toISOString(),
    summary: { total: 1, passed: 0, failed: 1, notRun: 0 },
    cases: [{ id: 'BROWSER-HARNESS', status: 'FAIL', evidence: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}` }]
  };
  writeResult(result);
  console.error(`FAIL BROWSER-HARNESS - ${result.cases[0].evidence}`);
  process.exitCode = 1;
} finally {
  if (networkOffline && cdp) {
    try {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
        connectionType: 'none'
      });
    } catch {
      // Cleanup continues even if the target is already gone.
    }
  }
  cdp?.close();
  stopBrowser(child);
  await closeServer(server);
  if (profileDirectory) {
    const resolved = path.resolve(profileDirectory);
    const tempRoot = path.resolve(os.tmpdir());
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('health-pwa-browser-test-')) throw new Error('Unsafe test profile cleanup path.');
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch (error) { console.error(`Temporary browser profile cleanup failed (${error.code}).`); }
  }
}

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { TestReporter } from './test-reporter.mjs';

const root = path.resolve(process.cwd());
const reporter = new TestReporter('smoke');
const output = path.join(root, 'tests/results/v0.4.0-smoke.json');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function collectModuleGraph(entryPath, visited = new Set()) {
  const normalized = entryPath.replaceAll('\\', '/');
  if (visited.has(normalized)) return visited;
  visited.add(normalized);

  const source = read(normalized);
  const importPattern = /(?:import\s+(?:[^'"]+?\s+from\s+)?|export\s+[^'"]*?\s+from\s+)['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(normalized), specifier));
    collectModuleGraph(resolved, visited);
  }
  return visited;
}

const requiredFiles = [
  'index.html', 'manifest.json', 'service-worker.js',
  'css/variables.css', 'css/common.css', 'css/layout.css',
  'js/config.js', 'js/app.js', 'js/router.js', 'js/components/bottom-nav.js',
  'js/bootstrap/bootstrap.js', 'js/bootstrap/container.js',
  'js/application/exercise-management.service.js', 'js/application/exercise-log.service.js', 'js/application/exercise-query.service.js',
  'js/core/exercise-fields.js', 'js/core/datetime.js', 'js/components/dirty-form-guard.js',
  'js/data/contracts/exercise-management-command.contract.js', 'js/data/indexeddb/commands/exercise-management.command.js',
  'js/pages/exercise/exercise.router.js', 'js/pages/exercise/exercise.page.js', 'js/pages/exercise/exercise-management.page.js',
  'js/pages/exercise/exercise-type-form.page.js', 'js/pages/exercise/exercise-log-form.page.js', 'js/pages/exercise/exercise-log-detail.page.js', 'js/pages/exercise/exercise-view.js',
  'js/data/indexeddb/database.js', 'js/data/indexeddb/schema.js',
  'icons/icon-192.png', 'icons/icon-512.png',
  'README.md', 'CHANGELOG.md', 'REQUIREMENTS.md', 'REGRESSION_TEST.md', 'RELEASE_REPORT.md',
  'docs/ARCHITECTURE.md', 'docs/DATA_MODEL.md', 'docs/MIGRATION_POLICY.md',
  'tests/architecture-test.mjs', 'tests/schema-test.mjs', 'tests/exercise-service-test.mjs',
  'tests/browser/db-test.html', 'tests/browser/db-test.js'
];

for (const file of requiredFiles) {
  reporter.check(`FILE:${file}`, fs.existsSync(path.join(root, file)), 'Required file exists.');
}

const manifest = JSON.parse(read('manifest.json'));
reporter.check('APP-002', manifest.display === 'standalone', 'manifest display=standalone');
reporter.check('APP-002-START', manifest.start_url === './#/home', 'Relative GitHub Pages start_url.');
reporter.check('APP-002-SCOPE', manifest.scope === './', 'Relative GitHub Pages scope.');
reporter.check('APP-002-ICONS', Array.isArray(manifest.icons) && manifest.icons.length >= 2, '192/512 icons are defined.');

const config = read('js/config.js');
reporter.check('VERSION-001', config.includes("APP_VERSION: '0.4.0'"), 'App version is v0.4.0.');
reporter.check('DB-CONFIG-001', config.includes('DB_VERSION: 1'), 'DB version is 1.');
reporter.check('SCHEMA-CONFIG-001', config.includes('SCHEMA_VERSION: 1'), 'Schema version is 1.');
reporter.check('SEED-CONFIG-001', config.includes('SEED_VERSION: 1'), 'Seed version is 1.');

const nav = read('js/components/bottom-nav.js');
for (const label of ['홈', '캘린더', '운동', '식단', '체중']) {
  reporter.check(`NAV:${label}`, nav.includes(`label: '${label}'`), 'Five-tab navigation retained.');
}

const sw = read('service-worker.js');
reporter.check('APP-004', sw.includes('caches.open(CACHE_NAME)'), 'App Shell is cached.');
reporter.check('CACHE-001', sw.includes('key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME'), 'Only this app\'s old caches are removed.');
reporter.check('CACHE-002', !sw.includes('indexedDB.deleteDatabase'), 'Cache lifecycle does not delete IndexedDB.');
reporter.check('UPD-001', sw.includes("event.data?.type === 'SKIP_WAITING'"), 'Update remains user-triggered.');
reporter.check('CACHE-ASSET-001', sw.includes("'./js/bootstrap/bootstrap.js'"), 'New application modules are in App Shell.');

const appShellBlock = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1] ?? '';
const appShellPaths = new Set([...appShellBlock.matchAll(/['"](\.\/[^'"]+)['"]/g)].map((match) => match[1].replace(/^\.\//, '')));
const moduleGraph = collectModuleGraph('js/app.js');
const missingOfflineModules = [...moduleGraph].filter((modulePath) => !appShellPaths.has(modulePath));
reporter.check('CACHE-ASSET-002', missingOfflineModules.length === 0, `All application modules are cached: ${missingOfflineModules.join(', ') || 'no missing modules'}`);
reporter.check('CACHE-ASSET-003', ![...appShellPaths].some((assetPath) => assetPath.startsWith('tests/')), 'Test files are excluded from the production App Shell.');
reporter.check('CACHE-REVALIDATE-001', sw.includes("{ cache: 'reload' }"), 'A new Service Worker revalidates App Shell files while installing.');

const app = read('js/app.js');
reporter.check('UPD-002', app.includes("waitingWorker.postMessage({ type: 'SKIP_WAITING' })"), 'Skip waiting is requested only by update action.');
const errors = read('js/core/errors.js');
reporter.check('ERROR-001', errors.includes('기존 데이터는 삭제되지 않았습니다.'), 'Public failure message preserves data semantics.');

const errorsSource = read('js/core/errors.js');
reporter.check('ERROR-004', errorsSource.includes('getActionErrorMessage') && errorsSource.includes('REVISION_CONFLICT'), 'CRUD conflicts are mapped to safe public operation messages.');
reporter.check('EX-UI-001', app.includes('renderExerciseRoute'), 'Exercise route is delegated to the exercise page module.');
reporter.check('EX-UI-002', sw.includes("'./js/pages/exercise/exercise.router.js'"), 'Exercise route modules are part of the offline App Shell.');
reporter.check('DIAG-001', app.includes('저장소 다시 진단'), 'Read-only DB diagnostic action exists.');
reporter.check('NAV-004', app.includes("navigate('/settings')"), 'Settings remains a header entry.');

reporter.finish(output);

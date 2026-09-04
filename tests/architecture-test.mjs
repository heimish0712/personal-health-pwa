import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { TestReporter } from './test-reporter.mjs';

const root = path.resolve(process.cwd());
const reporter = new TestReporter('architecture');
const output = path.join(root, 'tests/results/v0.2.0-architecture.json');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

const jsFiles = walk(path.join(root, 'js')).filter((file) => file.endsWith('.js'));
const directApiViolations = jsFiles
  .filter((file) => !relative(file).startsWith('js/data/indexeddb/'))
  .filter((file) => /\bindexedDB\s*\./.test(fs.readFileSync(file, 'utf8')))
  .map(relative);
reporter.check('ARCH-001', directApiViolations.length === 0, `Direct IndexedDB API outside adapter: ${directApiViolations.join(', ') || 'none'}`);

const applicationFiles = jsFiles.filter((file) => relative(file).startsWith('js/application/'));
const adapterImports = applicationFiles
  .filter((file) => /from\s+['"][^'"]*data\/indexeddb\//.test(fs.readFileSync(file, 'utf8')))
  .map(relative);
reporter.check('ARCH-002', adapterImports.length === 0, `Application service adapter imports: ${adapterImports.join(', ') || 'none'}`);

const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
reporter.check('ARCH-003', !/repositories\//.test(appSource) && !/data\/indexeddb\//.test(appSource), 'UI entry imports neither repositories nor IndexedDB adapters.');
reporter.check('ARCH-003-CONTEXT', !/appContext\?*\.container|appContext\.container/.test(appSource), 'UI receives a narrow application context instead of the concrete container.');

const containerSource = fs.readFileSync(path.join(root, 'js/bootstrap/container.js'), 'utf8');
reporter.check('ARCH-004', containerSource.includes('new IndexedDbDatabase') && containerSource.includes('new BootstrapService'), 'Container binds concrete adapters to application services.');
reporter.check('ARCH-004-ID', containerSource.includes('identityContext'), 'IdentityContext is injected through the container.');
reporter.check('ARCH-004-LOGGER', /logger\s*=\s*new AppLogger/.test(containerSource), 'A logger can be injected and reused across bootstrap retries.');

const contractSource = fs.readFileSync(path.join(root, 'js/data/contracts/repository.contract.js'), 'utf8');
for (const method of ['getById', 'getByIdIncludingDeleted', 'list', 'count', 'create', 'update', 'softDelete', 'restore']) {
  reporter.check(`CONTRACT:${method}`, new RegExp(`async\\s+${method}\\s*\\(`).test(contractSource), `${method} is part of the repository contract.`);
}
for (const forbidden of ['hardDelete', 'clear', 'upsert', 'put']) {
  reporter.check(`CONTRACT-NO:${forbidden}`, !new RegExp(`\\b${forbidden}\\s*\\(`).test(contractSource), `${forbidden} is not exposed by the repository contract.`);
}

const serviceTransactionViolations = applicationFiles
  .filter((file) => /runTransaction\s*\(|\.transaction\s*\(/.test(fs.readFileSync(file, 'utf8')))
  .map(relative);
reporter.check('ARCH-005', serviceTransactionViolations.length === 0, `Generic transaction use in application services: ${serviceTransactionViolations.join(', ') || 'none'}`);

const pageDirectRepository = /repositoryProvider|repositories\./.test(appSource);
reporter.check('ARCH-006', !pageDirectRepository, 'Page/UI code does not call repositories directly.');

const bootstrapSource = fs.readFileSync(path.join(root, 'js/bootstrap/bootstrap.js'), 'utf8');
reporter.check('ARCH-007', !/return\s+Object\.freeze\(\{\s*container[,}]/s.test(bootstrapSource), 'Bootstrap does not expose the concrete container to the UI.');
reporter.check('ARCH-008', bootstrapSource.includes('const applicationLogger = new AppLogger()'), 'Startup log memory survives an application bootstrap retry.');

const migrationSource = fs.readFileSync(path.join(root, 'js/data/indexeddb/migrations.js'), 'utf8');
reporter.check('MIG-SAFE-001', !/deleteObjectStore\s*\(|\.clear\s*\(/.test(migrationSource), 'Migration code neither deletes nor clears existing stores.');

const productionJs = jsFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
reporter.check('DATA-DEL-004', !/indexedDB\.deleteDatabase\s*\(/.test(productionJs), 'Production application code does not delete the user database.');

reporter.finish(output);

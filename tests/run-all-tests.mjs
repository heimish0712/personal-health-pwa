import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.cwd());
const suitesToRun = [
  { script: 'tests/smoke-test.mjs', result: 'tests/results/v0.3.0-smoke.json', suite: 'smoke' },
  { script: 'tests/architecture-test.mjs', result: 'tests/results/v0.3.0-architecture.json', suite: 'architecture' },
  { script: 'tests/schema-test.mjs', result: 'tests/results/v0.3.0-schema.json', suite: 'schema' },
  { script: 'tests/exercise-service-test.mjs', result: 'tests/results/v0.3.0-exercise-service.json', suite: 'exercise-service' },
  { script: 'tests/browser-runner.mjs', result: 'tests/results/v0.3.0-browser.json', suite: 'browser-runtime' }
];

for (const item of suitesToRun) {
  fs.rmSync(path.join(root, item.result), { force: true });
}
fs.rmSync(path.join(root, 'tests/results/v0.3.0.json'), { force: true });

let commandFailed = false;
for (const item of suitesToRun) {
  console.log(`\n=== ${item.script} ===`);
  const result = spawnSync(process.execPath, [item.script], {
    cwd: root,
    stdio: 'inherit',
    encoding: 'utf8'
  });
  if (result.status !== 0) commandFailed = true;
}

const suites = suitesToRun.map((item) => {
  const resultPath = path.join(root, item.result);
  if (!fs.existsSync(resultPath)) {
    commandFailed = true;
    return {
      version: '0.3.0',
      suite: item.suite,
      executedAt: new Date().toISOString(),
      summary: { total: 1, passed: 0, failed: 1, notRun: 0 },
      cases: [{
        id: `RESULT-MISSING:${item.suite}`,
        status: 'FAIL',
        evidence: `Expected result file was not created: ${item.result}`
      }]
    };
  }
  return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
});

const manualCases = [
  { id: 'APP-001', status: 'NOT_RUN', evidence: 'Deploy v0.3.0 to the user GitHub Pages repository.' },
  { id: 'APP-002', status: 'NOT_RUN', evidence: 'Verify install/update behavior on Galaxy Chrome.' },
  { id: 'APP-003', status: 'NOT_RUN', evidence: 'Verify standalone launch on the installed app.' },
  { id: 'APP-004', status: 'NOT_RUN', evidence: 'Verify offline relaunch on the deployed installed app.' },
  { id: 'CACHE-RUNTIME-001', status: 'NOT_RUN', evidence: 'Verify v0.2.0 App Shell replacement by v0.3.0 on the deployed origin.' }
];

const cases = [
  ...suites.flatMap((suite) => suite.cases.map((item) => ({ ...item, suite: suite.suite }))),
  ...manualCases.map((item) => ({ ...item, suite: 'manual-deployment' }))
];
const passed = cases.filter((item) => item.status === 'PASS').length;
const failed = cases.filter((item) => item.status === 'FAIL').length;
const notRun = cases.filter((item) => item.status === 'NOT_RUN').length;
const browserSuite = suites.find((suite) => suite.userAgent);
const aggregate = {
  version: '0.3.0',
  previousVersion: '0.2.0',
  executedAt: new Date().toISOString(),
  environments: {
    node: process.version,
    browser: browserSuite?.userAgent ?? 'not available'
  },
  summary: { total: cases.length, passed, failed, notRun },
  suites: suites.map((suite) => ({ suite: suite.suite, summary: suite.summary })),
  cases
};

const aggregatePath = path.join(root, 'tests/results/v0.3.0.json');
fs.mkdirSync(path.dirname(aggregatePath), { recursive: true });
fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
console.log(`\nAGGREGATE: TOTAL ${cases.length} / PASS ${passed} / FAIL ${failed} / NOT_RUN ${notRun}`);

if (commandFailed || failed > 0) process.exitCode = 1;

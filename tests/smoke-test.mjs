import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd());
const checks = [];

function check(id, condition, detail) {
  checks.push({ id, pass: Boolean(condition), detail });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const requiredFiles = [
  'index.html', 'manifest.json', 'service-worker.js',
  'css/variables.css', 'css/common.css', 'css/layout.css',
  'js/config.js', 'js/app.js', 'js/router.js', 'js/components/bottom-nav.js',
  'icons/icon-192.png', 'icons/icon-512.png',
  'README.md', 'CHANGELOG.md', 'REQUIREMENTS.md', 'REGRESSION_TEST.md'
];

for (const file of requiredFiles) {
  check(`FILE:${file}`, fs.existsSync(path.join(root, file)), '필수 파일 존재');
}

const manifest = JSON.parse(read('manifest.json'));
check('APP-002', manifest.display === 'standalone', 'manifest display=standalone');
check('APP-002-START', manifest.start_url === './#/home', 'GitHub Pages 하위 경로용 상대 start_url');
check('APP-002-SCOPE', manifest.scope === './', 'GitHub Pages 하위 경로용 상대 scope');
check('APP-002-ICONS', Array.isArray(manifest.icons) && manifest.icons.length >= 2, '192/512 아이콘 정의');

const config = read('js/config.js');
check('VERSION-001', config.includes("APP_VERSION: '0.1.0'"), '앱 버전 고정');
check('DATA-001', config.includes('DB_VERSION: 0'), 'v0.1.0 DB 미사용');

const nav = read('js/components/bottom-nav.js');
for (const label of ['홈', '캘린더', '운동', '식단', '체중']) {
  check(`NAV:${label}`, nav.includes(`label: '${label}'`), '5탭 구성 확인');
}

const sw = read('service-worker.js');
check('APP-004', sw.includes('caches.open(CACHE_NAME)'), 'App Shell 캐시 설치');
check('CACHE-001', sw.includes(".filter((key) => key !== CACHE_NAME)"), '구 캐시 정리');
check('UPD-001', sw.includes("event.data?.type === 'SKIP_WAITING'"), '사용자 승인 기반 업데이트 활성화');

const app = read('js/app.js');
check('UPD-002', app.includes("waitingWorker.postMessage({ type: 'SKIP_WAITING' })"), '업데이트 버튼에서만 skipWaiting 요청');
check('ERROR-001', app.includes("showError('오프라인 실행 준비에 실패했습니다."), '내부 오류 대신 사용자 메시지');

const failed = checks.filter((item) => !item.pass);
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.id} - ${item.detail}`);
}
console.log(`\nTOTAL ${checks.length} / PASS ${checks.length - failed.length} / FAIL ${failed.length}`);
process.exitCode = failed.length ? 1 : 0;

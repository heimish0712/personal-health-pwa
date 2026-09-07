import { bootstrapApplication } from './bootstrap/bootstrap.js';
import { getActionErrorMessage, getPublicErrorMessage } from './core/errors.js';
import { canLeaveCurrentRoute, clearNavigationGuard, navigate, startRouter } from './router.js';
import { renderBottomNav } from './components/bottom-nav.js';
import { renderExerciseRoute } from './pages/exercise/exercise.router.js';
import { mountBackupSettings } from './pages/settings/backup-restore.page.js';

const pageRoot = document.querySelector('#page-root');
const pageTitle = document.querySelector('#page-title');
const bottomNav = document.querySelector('#bottom-nav');
const settingsButton = document.querySelector('#settings-button');
const updateBanner = document.querySelector('#update-banner');
const updateLater = document.querySelector('#update-later');
const updateNow = document.querySelector('#update-now');
const toast = document.querySelector('#toast');

const PAGE_META = {
  '/home': { title: '홈', message: '로컬 우선 데이터 기반 준비 완료' },
  '/calendar': { title: '캘린더', message: '캘린더 기능은 후속 버전에서 연결됩니다.' },
  '/diet': { title: '식단', message: '식단 기록 기능은 후속 버전에서 연결됩니다.' },
  '/weight': { title: '체중', message: '체중·인바디 기능은 후속 버전에서 연결됩니다.' },
  '/settings': { title: '설정', message: '데이터 저장소 상태를 확인합니다.' }
};

let appContext = null;
let waitingWorker = null;
let toastTimer = null;
let renderToken = 0;
let routerStarted = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
}

function showError(message, error = null) {
  console.error(message, error ?? '');
  showToast(error ? getActionErrorMessage(error, message || undefined) : message);
  if (appContext?.logger) {
    void appContext.logger.error(error?.code ?? 'UI_ERROR', 'UI operation failed.', { errorName: error?.name ?? null });
  }
}

function renderLoading(title = '준비 중') {
  pageTitle.textContent = title;
  pageRoot.innerHTML = '<section class="card empty-state" aria-busy="true"><div><strong>데이터 저장소를 확인하고 있습니다.</strong><span>기존 데이터는 변경하지 않습니다.</span></div></section>';
}

function renderHome(meta) {
  const diagnostic = appContext.diagnostic;
  pageRoot.innerHTML = `
    <section class="card"><h2>${escapeHtml(globalThis.APP_CONFIG.APP_NAME)}</h2><p>${escapeHtml(meta.message)}</p><span class="version-chip">v${escapeHtml(globalThis.APP_CONFIG.APP_VERSION)} · DB ${escapeHtml(globalThis.APP_CONFIG.DB_VERSION)}</span></section>
    <section class="card"><h2>현재 단계</h2><p>운동 기록과 JSON 백업·복원을 오프라인으로 사용할 수 있습니다. 백업은 설정에서 관리합니다. 이용권과 예약은 v0.5.0에서 연결합니다.</p></section>
    <section class="card compact-card"><div class="status-line"><span>로컬 데이터 저장소</span><strong class="status-normal">${diagnostic?.status === 'normal' ? '정상' : '확인 필요'}</strong></div></section>`;
}

async function renderSettings(token) {
  pageRoot.innerHTML = '<section class="card empty-state" aria-busy="true"><div><strong>저장소 진단 중</strong><span>읽기 전용으로 구조와 Profile 연결을 확인합니다.</span></div></section>';
  try {
    const diagnostic = await appContext.services.databaseDiagnostic.diagnose();
    if (token !== renderToken) return;
    appContext = Object.freeze({ ...appContext, diagnostic });
    const recentError = diagnostic.recentError ? `${diagnostic.recentError.event} · ${new Date(diagnostic.recentError.createdAt).toLocaleString('ko-KR')}` : '없음';
    pageRoot.innerHTML = `
      <section class="card"><h2>데이터 저장소</h2><dl class="diagnostic-list">
        <div><dt>상태</dt><dd class="${diagnostic.status === 'normal' ? 'status-normal' : 'status-warning'}">${diagnostic.status === 'normal' ? '정상' : '확인 필요'}</dd></div>
        <div><dt>DB Version</dt><dd>${diagnostic.databaseVersion}</dd></div><div><dt>Schema Version</dt><dd>${diagnostic.schemaVersion}</dd></div>
        <div><dt>Object Store</dt><dd>${diagnostic.actualStoreCount} / ${diagnostic.expectedStoreCount}</dd></div>
        <div><dt>Current Profile</dt><dd>${diagnostic.profileConnected ? '연결됨' : '연결 오류'}</dd></div>
        <div><dt>Profile ID</dt><dd>${diagnostic.profileId ? `${escapeHtml(diagnostic.profileId.slice(0, 8))}…` : '없음'}</dd></div>
        <div><dt>Profile Seed</dt><dd>${diagnostic.seedVersion ?? '없음'}</dd></div><div><dt>Timezone</dt><dd>${escapeHtml(diagnostic.timezone ?? '없음')}</dd></div>
        <div><dt>최근 DB 오류</dt><dd>${escapeHtml(recentError)}</dd></div></dl>
        ${diagnostic.missingStores.length ? `<p class="warning-text">누락 Store: ${escapeHtml(diagnostic.missingStores.join(', '))}</p>` : ''}
        <button id="diagnose-again" class="button full-width-button" type="button">저장소 다시 진단</button></section>
      <section class="card"><h2>데이터 보호</h2><p>저장소 진단은 데이터를 변경하지 않습니다. 백업 복원은 초기 상태에서만 실행할 수 있습니다.</p></section>`;
    document.querySelector('#diagnose-again')?.addEventListener('click', () => { if (!canLeaveCurrentRoute()) return; const nextToken = ++renderToken; void renderSettings(nextToken); });
    mountBackupSettings(pageRoot, { services: appContext.services, showToast, isCurrent: () => token === renderToken });
  } catch (error) {
    if (token !== renderToken) return;
    showError('저장소 진단에 실패했습니다.', error);
    pageRoot.innerHTML = '<section class="card error-card"><h2>저장소 진단 실패</h2><p>기존 데이터는 변경되지 않았습니다.</p><button id="diagnose-retry" class="button" type="button">다시 시도</button></section>';
    document.querySelector('#diagnose-retry')?.addEventListener('click', () => { const nextToken = ++renderToken; void renderSettings(nextToken); });
  }
}

async function renderPage(route) {
  const token = ++renderToken;
  clearNavigationGuard();
  renderBottomNav(bottomNav, route);
  const isCurrent = () => token === renderToken;

  if (route.startsWith('/exercise')) {
    try {
      await renderExerciseRoute(route, {
        root: pageRoot,
        services: appContext.services,
        navigate,
        setTitle(title) { pageTitle.textContent = title; },
        showToast,
        showError,
        isCurrent
      });
    } catch (error) {
      if (!isCurrent()) return;
      pageTitle.textContent = '운동';
      showError('운동 화면을 불러오지 못했습니다.', error);
      pageRoot.innerHTML = '<section class="card error-card"><h2>운동 화면 오류</h2><p>기존 데이터는 변경되지 않았습니다.</p><button id="exercise-error-back" class="button" type="button">운동으로 돌아가기</button></section>';
      pageRoot.querySelector('#exercise-error-back')?.addEventListener('click', () => navigate('/exercise'));
    }
    return;
  }

  const meta = PAGE_META[route] || PAGE_META[globalThis.APP_CONFIG.DEFAULT_ROUTE];
  pageTitle.textContent = meta.title;
  if (route === '/home') { renderHome(meta); return; }
  if (route === '/settings') { await renderSettings(token); return; }
  pageRoot.innerHTML = `<section class="card empty-state"><div><strong>${escapeHtml(meta.title)}</strong><span>${escapeHtml(meta.message)}</span></div></section>`;
}

function renderBootstrapFailure(error) {
  pageTitle.textContent = '오류'; bottomNav.innerHTML = '';
  pageRoot.innerHTML = `<section class="card error-card"><h2>앱을 시작하지 못했습니다.</h2><p>${escapeHtml(getPublicErrorMessage(error))}</p><p class="error-code">오류코드: ${escapeHtml(error?.code ?? 'DB_INIT_FAILED')}</p><button id="bootstrap-retry" class="button" type="button">다시 시도</button></section>`;
  document.querySelector('#bootstrap-retry')?.addEventListener('click', () => void initializeApplication());
}

function showUpdate(worker) { waitingWorker = worker; updateBanner.hidden = false; }

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) { showError('이 브라우저는 오프라인 앱 기능을 지원하지 않습니다.'); return; }
  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
    if (registration.waiting) showUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing; if (!installingWorker) return;
      installingWorker.addEventListener('statechange', () => { if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(installingWorker); });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
  } catch (error) { showError('오프라인 실행 준비에 실패했습니다. 온라인 상태에서 다시 열어주세요.', error); }
}

async function initializeApplication() {
  settingsButton.disabled = true; renderLoading();
  try {
    appContext = await bootstrapApplication(); settingsButton.disabled = false;
    if (!routerStarted) { routerStarted = true; startRouter((route) => void renderPage(route)); void registerServiceWorker(); }
    else { await renderPage(window.location.hash.replace(/^#/, '') || globalThis.APP_CONFIG.DEFAULT_ROUTE); }
  } catch (error) { settingsButton.disabled = false; renderBootstrapFailure(error); }
}

settingsButton.addEventListener('click', () => navigate('/settings'));
updateLater.addEventListener('click', () => { updateBanner.hidden = true; });
updateNow.addEventListener('click', () => {
  if (!waitingWorker) return;
  if (!canLeaveCurrentRoute()) return;
  updateNow.disabled = true; waitingWorker.postMessage({ type: 'SKIP_WAITING' });
});
window.addEventListener('error', (event) => { void appContext?.logger.error('UNHANDLED_ERROR', 'Unhandled window error.', { name: event.error?.name ?? null }); });
window.addEventListener('unhandledrejection', (event) => { void appContext?.logger.error('UNHANDLED_ERROR', 'Unhandled promise rejection.', { name: event.reason?.name ?? null }); });

void initializeApplication();

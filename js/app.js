import { navigate, startRouter } from './router.js';
import { renderBottomNav } from './components/bottom-nav.js';

const pageRoot = document.querySelector('#page-root');
const pageTitle = document.querySelector('#page-title');
const bottomNav = document.querySelector('#bottom-nav');
const settingsButton = document.querySelector('#settings-button');
const updateBanner = document.querySelector('#update-banner');
const updateLater = document.querySelector('#update-later');
const updateNow = document.querySelector('#update-now');
const toast = document.querySelector('#toast');

const PAGE_META = {
  '/home': { title: '홈', message: '앱 설치 및 기본 환경 준비 완료' },
  '/calendar': { title: '캘린더', message: '캘린더 기능은 후속 버전에서 연결됩니다.' },
  '/exercise': { title: '운동', message: '운동 기록 기능은 후속 버전에서 연결됩니다.' },
  '/diet': { title: '식단', message: '식단 기록 기능은 후속 버전에서 연결됩니다.' },
  '/weight': { title: '체중', message: '체중·인바디 기능은 후속 버전에서 연결됩니다.' },
  '/settings': { title: '설정', message: '백업·저장공간 설정은 후속 버전에서 연결됩니다.' }
};

let waitingWorker = null;
let toastTimer = null;

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function showError(message) {
  console.error(message);
  showToast(message);
}

function renderPage(route) {
  const meta = PAGE_META[route] || PAGE_META[APP_CONFIG.DEFAULT_ROUTE];
  pageTitle.textContent = meta.title;
  renderBottomNav(bottomNav, route);

  if (route === '/home') {
    pageRoot.innerHTML = `
      <section class="card">
        <h2>${APP_CONFIG.APP_NAME}</h2>
        <p>${meta.message}</p>
        <span class="version-chip">v${APP_CONFIG.APP_VERSION} · DB ${APP_CONFIG.DB_VERSION}</span>
      </section>
      <section class="card">
        <h2>현재 단계</h2>
        <p>PWA 설치, 오프라인 앱 셸, 5탭 라우팅, 업데이트 감지까지 검증하는 버전입니다. 실제 건강 기록은 아직 저장하지 않습니다.</p>
      </section>
    `;
    return;
  }

  pageRoot.innerHTML = `
    <section class="card empty-state">
      <div>
        <strong>${meta.title}</strong>
        <span>${meta.message}</span>
      </div>
    </section>
  `;
}

function showUpdate(worker) {
  waitingWorker = worker;
  updateBanner.hidden = false;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    showError('이 브라우저는 오프라인 앱 기능을 지원하지 않습니다.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });

    if (registration.waiting) {
      showUpdate(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdate(installingWorker);
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  } catch (error) {
    console.error(error);
    showError('오프라인 실행 준비에 실패했습니다. 온라인 상태에서 다시 열어주세요.');
  }
}

settingsButton.addEventListener('click', () => navigate('/settings'));
updateLater.addEventListener('click', () => {
  updateBanner.hidden = true;
});
updateNow.addEventListener('click', () => {
  if (!waitingWorker) return;
  updateNow.disabled = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
});

window.addEventListener('error', (event) => {
  console.error('Unhandled error:', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

startRouter(renderPage);
registerServiceWorker();

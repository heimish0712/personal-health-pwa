const STATIC_ROUTES = new Set(['/home', '/calendar', '/exercise', '/diet', '/weight', '/settings']);
const DYNAMIC_ROUTE_PATTERNS = [
  /^\/exercise\/log\/new$/,
  /^\/exercise\/log\/[^/]+$/,
  /^\/exercise\/log\/[^/]+\/edit$/,
  /^\/exercise\/manage$/,
  /^\/exercise\/type\/new$/,
  /^\/exercise\/type\/[^/]+\/edit$/,
  /^\/exercise\/type\/[^/]+\/template$/
];

let currentRoute = null;
let navigationGuard = null;
let suppressNextHashChange = false;

export function isSupportedRoute(route) {
  return STATIC_ROUTES.has(route) || DYNAMIC_ROUTE_PATTERNS.some((pattern) => pattern.test(route));
}

export function normalizeRoute(hash) {
  const raw = (hash || '').replace(/^#/, '') || globalThis.APP_CONFIG.DEFAULT_ROUTE;
  return isSupportedRoute(raw) ? raw : globalThis.APP_CONFIG.DEFAULT_ROUTE;
}

export function setNavigationGuard(guard) {
  navigationGuard = typeof guard === 'function' ? guard : null;
}

export function clearNavigationGuard() {
  navigationGuard = null;
}

export function hasNavigationGuard() {
  return Boolean(navigationGuard);
}

export function canLeaveCurrentRoute() {
  return !navigationGuard || navigationGuard({ from: currentRoute, to: null, external: true }) !== false;
}

function canNavigate(nextRoute) {
  return !navigationGuard || navigationGuard({ from: currentRoute, to: nextRoute }) !== false;
}

export function navigate(route) {
  const normalized = isSupportedRoute(route) ? route : globalThis.APP_CONFIG.DEFAULT_ROUTE;
  if (!canNavigate(normalized)) return false;
  if (window.location.hash === `#${normalized}`) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return true;
  }
  window.location.hash = normalized;
  return true;
}

export function startRouter(onRoute) {
  const renderCurrent = () => {
    if (suppressNextHashChange) {
      suppressNextHashChange = false;
      return;
    }
    const nextRoute = normalizeRoute(window.location.hash);
    if (currentRoute && nextRoute !== currentRoute && !canNavigate(nextRoute)) {
      suppressNextHashChange = true;
      window.location.hash = currentRoute;
      return;
    }
    currentRoute = nextRoute;
    onRoute(nextRoute);
  };
  window.addEventListener('hashchange', renderCurrent);

  window.addEventListener('beforeunload', (event) => {
    if (!navigationGuard) return;
    if (navigationGuard({ from: currentRoute, to: null, unloading: true }) === false) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  if (!window.location.hash) {
    window.location.replace(`#${globalThis.APP_CONFIG.DEFAULT_ROUTE}`);
  } else {
    renderCurrent();
  }
}

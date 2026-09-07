const STATIC_ROUTES = new Set(['/home', '/calendar', '/exercise', '/diet', '/weight', '/settings', '/exercise/passes']);
const DYNAMIC_ROUTE_PATTERNS = [
  /^\/diet\/log\/(new|[^/]+)(\/edit)?$/,
  /^\/weight\/(log|inbody)\/(new|[^/]+)(\/edit)?$/,
  /^\/exercise\/pass\/new$/,
  /^\/exercise\/pass\/[^/]+\/edit$/,
  /^\/exercise\/schedule\/new$/,
  /^\/exercise\/schedule\/[^/]+\/(edit|complete)$/,
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
  const { path } = parseRoute(route);
  return STATIC_ROUTES.has(path) || DYNAMIC_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
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

// Date context lives in the hash, so browser Back and reload retain the selected day.
export function parseRoute(route) {
  const [path, query = ''] = String(route).split('?');
  const params = new URLSearchParams(query), value = params.get('date');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value ? value : null;
  return { path, selectedDate: date, returnRoute: date && params.get('from') === 'calendar' ? `/calendar?date=${date}` : null };
}
export function initialRecordTime(context, now) { return context.selectedDate ? `${context.selectedDate}T${now.slice(11)}` : now; }

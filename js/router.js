const ROUTES = new Set(['/home', '/calendar', '/exercise', '/diet', '/weight', '/settings']);

export function normalizeRoute(hash) {
  const raw = (hash || '').replace(/^#/, '') || globalThis.APP_CONFIG.DEFAULT_ROUTE;
  return ROUTES.has(raw) ? raw : globalThis.APP_CONFIG.DEFAULT_ROUTE;
}

export function navigate(route) {
  const normalized = ROUTES.has(route) ? route : globalThis.APP_CONFIG.DEFAULT_ROUTE;
  if (window.location.hash === `#${normalized}`) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = normalized;
}

export function startRouter(onRoute) {
  const renderCurrent = () => onRoute(normalizeRoute(window.location.hash));
  window.addEventListener('hashchange', renderCurrent);

  if (!window.location.hash) {
    window.location.replace(`#${globalThis.APP_CONFIG.DEFAULT_ROUTE}`);
  } else {
    renderCurrent();
  }
}

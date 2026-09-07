importScripts('./js/config.js');

const CACHE_NAME = APP_CONFIG.CACHE_VERSION;
const CACHE_PREFIX = APP_CONFIG.CACHE_PREFIX;
const APP_SHELL = [
  './js/application/pass-schedule.service.js',
  './js/core/pass-rules.js',
  './js/pages/exercise/pass-schedule.page.js',
  './js/data/contracts/activity-command.contract.js',
  './js/data/indexeddb/commands/activity.command.js',
  './js/data/indexeddb/repositories/scoped-index-query.js',

  './',
  './index.html',
  './manifest.json',
  './css/variables.css',
  './css/common.css',
  './css/layout.css',
  './js/config.js',
  './js/app.js',
  './js/router.js',
  './js/components/bottom-nav.js',
  './js/components/dirty-form-guard.js',
  './js/pages/exercise/exercise.router.js',
  './js/pages/exercise/exercise.page.js',
  './js/pages/exercise/exercise-management.page.js',
  './js/pages/exercise/exercise-type-form.page.js',
  './js/pages/exercise/exercise-log-form.page.js',
  './js/pages/exercise/exercise-log-detail.page.js',
  './js/pages/exercise/exercise-view.js',
  './js/bootstrap/bootstrap.js',
  './js/bootstrap/container.js',
  './js/core/app-logger.js',
  './js/core/clock.js',
  './js/core/entity-metadata.js',
  './js/core/errors.js',
  './js/core/id-generator.js',
  './js/core/identity-context.js',
  './js/core/exercise-fields.js',
  './js/core/datetime.js',
  './js/application/bootstrap.service.js',
  './js/application/database-diagnostic.service.js',
  './js/application/exercise-management.service.js',
  './js/application/exercise-log.service.js',
  './js/application/exercise-query.service.js',
  './js/data/repository-provider.js',
  './js/data/contracts/repository.contract.js',
  './js/data/contracts/bootstrap-command.contract.js',
  './js/data/contracts/exercise-management-command.contract.js',
  './js/data/indexeddb/database.js',
  './js/data/indexeddb/idb-request.js',
  './js/data/indexeddb/indexeddb-unit-of-work.js',
  './js/data/indexeddb/migrations.js',
  './js/data/indexeddb/schema.js',
  './js/data/indexeddb/commands/bootstrap.command.js',
  './js/data/indexeddb/commands/exercise-management.command.js',
  './js/data/indexeddb/repositories/base-scoped.repository.js',
  './js/data/indexeddb/repositories/profile.repository.js',
  './js/data/indexeddb/repositories/exercise-type.repository.js',
  './js/data/indexeddb/repositories/exercise-template.repository.js',
  './js/data/indexeddb/repositories/exercise-log.repository.js',
  './js/data/indexeddb/repositories/exercise-schedule.repository.js',
  './js/data/indexeddb/repositories/pass.repository.js',
  './js/data/indexeddb/repositories/pass-usage.repository.js',
  './js/data/indexeddb/repositories/diet-log.repository.js',
  './js/data/indexeddb/repositories/diet-photo.repository.js',
  './js/data/indexeddb/repositories/weight.repository.js',
  './js/data/indexeddb/repositories/inbody.repository.js',
  './js/data/indexeddb/repositories/user-settings.repository.js',
  './js/data/indexeddb/repositories/device-settings.repository.js',
  './js/data/indexeddb/repositories/app-log.repository.js',
  './js/core/backup/backup-format.js',
  './js/core/backup/backup-validator.js',
  './js/core/backup/backup-integrity.js',
  './js/core/backup/canonical-json.js',
  './js/core/backup/backup-migrations.js',
  './js/application/backup-export.service.js',
  './js/application/backup-import.service.js',
  './js/application/backup-validation.service.js',
  './js/data/contracts/backup-snapshot-reader.contract.js',
  './js/data/contracts/backup-restore-command.contract.js',
  './js/data/indexeddb/backup/backup-snapshot.reader.js',
  './js/data/indexeddb/backup/backup-restore.command.js',
  './js/data/indexeddb/backup/restore-target.inspector.js',
  './js/pages/settings/backup-restore.page.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  const installRequests = APP_SHELL.map((assetPath) => new Request(
    new URL(assetPath, self.location.href),
    { cache: 'reload' }
  ));

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(installRequests))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      });
    }).catch(async () => {
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
      return new Response('Offline resource unavailable.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

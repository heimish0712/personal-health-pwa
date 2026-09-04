(function (global) {
  'use strict';

  global.APP_CONFIG = Object.freeze({
    APP_NAME: '개인 건강 기록',
    APP_VERSION: '0.2.0',
    CACHE_PREFIX: 'personal-health-pwa-',
    CACHE_VERSION: 'personal-health-pwa-v0.2.0',
    DB_NAME: 'personal-health-pwa',
    DB_VERSION: 1,
    SCHEMA_VERSION: 1,
    SEED_VERSION: 1,
    DEFAULT_ROUTE: '/home',
    DEFAULT_TIMEZONE: 'Asia/Seoul',
    APP_LOG_LIMIT: 200
  });
})(globalThis);

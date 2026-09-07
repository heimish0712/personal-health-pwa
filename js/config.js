(function (global) {
  'use strict';

  global.APP_CONFIG = Object.freeze({
    APP_NAME: '개인 건강 기록',
    APP_VERSION: '0.8.0',
    CACHE_PREFIX: 'personal-health-pwa-',
    CACHE_VERSION: 'personal-health-pwa-v0.8.0',
    DB_NAME: 'personal-health-pwa',
    DB_VERSION: 2,
    SCHEMA_VERSION: 1,
    SEED_VERSION: 1,
    BACKUP_FORMAT_VERSION: 2,
    MEDIA: Object.freeze({ MAX_INPUT_BYTES: 25000000, MAX_PIXELS: 50000000, MAX_EDGE: 1280, THUMB_EDGE: 320, QUALITY: 0.82, THUMB_QUALITY: 0.75, MAX_PHOTOS: 12 }),
    DEFAULT_ROUTE: '/home',
    DEFAULT_TIMEZONE: 'Asia/Seoul',
    APP_LOG_LIMIT: 200
  });
})(globalThis);

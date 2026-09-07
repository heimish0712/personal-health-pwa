import { STORE_DEFINITIONS } from './schema.js';
import { DatabaseMigrationError } from '../../core/errors.js';

function ensureIndex(objectStore, definition) {
  if (objectStore.indexNames.contains(definition.name)) return;
  objectStore.createIndex(definition.name, definition.keyPath, definition.options);
}

function migrateToVersion1(database, transaction) {
  for (const [storeName, definition] of Object.entries(STORE_DEFINITIONS)) {
    if (storeName === 'media_blobs') continue; // v1 remains the original 14-store layout.
    const objectStore = database.objectStoreNames.contains(storeName)
      ? transaction.objectStore(storeName)
      : database.createObjectStore(storeName, { keyPath: definition.keyPath });

    for (const indexDefinition of definition.indexes) {
      ensureIndex(objectStore, indexDefinition);
    }
  }
}

export function applyMigrations({ database, transaction, oldVersion, newVersion }) {
  try {
    if (oldVersion < 1 && newVersion >= 1) {
      migrateToVersion1(database, transaction);
    }
    if (oldVersion < 2 && newVersion >= 2 && !database.objectStoreNames.contains('media_blobs')) {
      database.createObjectStore('media_blobs', { keyPath: 'storage_key' });
    }
  } catch (error) {
    throw new DatabaseMigrationError(
      'DB_MIGRATION_FAILED',
      `IndexedDB migration failed for version ${oldVersion} -> ${newVersion}.`,
      { cause: error, details: { oldVersion, newVersion } }
    );
  }
}

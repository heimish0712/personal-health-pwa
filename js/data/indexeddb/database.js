import { applyMigrations } from './migrations.js';
import { DB_NAME, DB_VERSION } from './schema.js';
import {
  DatabaseBlockedError,
  DatabaseError,
  DatabaseMigrationError
} from '../../core/errors.js';
import { transactionToPromise } from './idb-request.js';

export class IndexedDbDatabase {
  #name;
  #version;
  #migrate;
  #connection = null;
  #openPromise = null;
  #onEvent;

  constructor({
    name = DB_NAME,
    version = DB_VERSION,
    migrate = applyMigrations,
    onEvent = () => {}
  } = {}) {
    this.#name = name;
    this.#version = version;
    this.#migrate = migrate;
    this.#onEvent = onEvent;
  }

  get name() {
    return this.#name;
  }

  get version() {
    return this.#version;
  }

  async open() {
    if (this.#connection) return this.#connection;
    if (this.#openPromise) return this.#openPromise;

    if (!globalThis.indexedDB) {
      throw new DatabaseError('INDEXEDDB_UNSUPPORTED', 'IndexedDB is unavailable in this browser.');
    }

    this.#openPromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(this.#name, this.#version);
      let settled = false;
      let migrationFailure = null;

      request.addEventListener('upgradeneeded', (event) => {
        try {
          this.#migrate({
            database: request.result,
            transaction: request.transaction,
            oldVersion: event.oldVersion,
            newVersion: event.newVersion ?? this.#version
          });
        } catch (error) {
          migrationFailure = error;
          request.transaction?.abort();
        }
      });

      request.addEventListener('blocked', () => {
        this.#onEvent('DB_BLOCKED', { databaseName: this.#name, version: this.#version });
        if (settled) return;
        settled = true;
        reject(new DatabaseBlockedError(
          'DB_BLOCKED',
          'IndexedDB upgrade is blocked by another open connection.'
        ));
      });

      request.addEventListener('error', () => {
        if (settled) return;
        settled = true;
        if (migrationFailure) {
          reject(migrationFailure instanceof DatabaseMigrationError
            ? migrationFailure
            : new DatabaseMigrationError('DB_MIGRATION_FAILED', 'IndexedDB migration failed.', { cause: migrationFailure }));
          return;
        }
        reject(new DatabaseError('DB_OPEN_FAILED', 'IndexedDB could not be opened.', { cause: request.error }));
      });

      request.addEventListener('success', () => {
        const connection = request.result;
        if (settled) {
          connection.close();
          return;
        }

        settled = true;
        this.#connection = connection;
        connection.addEventListener('versionchange', () => {
          this.#onEvent('DB_VERSION_CHANGE', { databaseName: this.#name });
          connection.close();
          if (this.#connection === connection) this.#connection = null;
          this.#openPromise = null;
        });
        resolve(connection);
      });
    }).finally(() => {
      if (!this.#connection) this.#openPromise = null;
    });

    return this.#openPromise;
  }

  async runTransaction(storeNames, mode, work) {
    const connection = await this.open();
    const transaction = connection.transaction(storeNames, mode);
    const completion = transactionToPromise(transaction);
    const stores = new Map(storeNames.map((name) => [name, transaction.objectStore(name)]));

    const context = Object.freeze({
      transaction,
      store(name) {
        const objectStore = stores.get(name);
        if (!objectStore) throw new Error(`Object Store is outside this transaction: ${name}`);
        return objectStore;
      }
    });

    let result;
    try {
      result = await work(context);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be completed or aborted.
      }
      try {
        await completion;
      } catch {
        // Preserve the original application error.
      }
      throw error;
    }

    try {
      await completion;
      return result;
    } catch (error) {
      throw new DatabaseError('DB_TRANSACTION_FAILED', 'IndexedDB transaction failed.', { cause: error });
    }
  }

  async inspectSchema() {
    const connection = await this.open();
    const storeNames = Array.from(connection.objectStoreNames);
    const transaction = connection.transaction(storeNames, 'readonly');
    const stores = {};

    for (const storeName of storeNames) {
      const objectStore = transaction.objectStore(storeName);
      const indexNames = Array.from(objectStore.indexNames);
      stores[storeName] = {
        keyPath: objectStore.keyPath,
        indexes: indexNames,
        indexDefinitions: indexNames.map((indexName) => {
          const currentIndex = objectStore.index(indexName);
          return {
            name: currentIndex.name,
            keyPath: currentIndex.keyPath,
            unique: currentIndex.unique,
            multiEntry: currentIndex.multiEntry
          };
        })
      };
    }

    return {
      name: connection.name,
      version: connection.version,
      storeNames,
      stores
    };
  }

  close() {
    this.#connection?.close();
    this.#connection = null;
    this.#openPromise = null;
  }
}

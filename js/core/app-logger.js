import { safeLog } from './log-privacy.js';
const MEMORY_QUEUE_LIMIT = 50;

export class AppLogger {
  #repository = null;
  #queue = [];

  attachRepository(repository) {
    this.#repository = repository;
    return this.#flush();
  }

  async info(event, message, context = null) {
    return this.#write('INFO', event, message, context);
  }

  async warn(event, message, context = null) {
    return this.#write('WARN', event, message, context);
  }

  async error(event, message, context = null) {
    return this.#write('ERROR', event, message, context);
  }

  async #write(level, event, message, context) {
    const entry = safeLog({
      level,
      event,
      message,
      context
    });

    const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'info';
    console[consoleMethod](`[${entry.event}] ${entry.message}`, entry.context ?? '');

    if (!this.#repository) {
      this.#queue.push(entry);
      if (this.#queue.length > MEMORY_QUEUE_LIMIT) this.#queue.shift();
      return;
    }

    try {
      await this.#repository.append(entry);
    } catch (error) {
      console.error('[APP_LOG_WRITE_FAILED]', error);
    }
  }

  async #flush() {
    if (!this.#repository || this.#queue.length === 0) return;
    const pending = this.#queue.splice(0);
    for (const entry of pending) {
      try {
        await this.#repository.append(entry);
      } catch (error) {
        console.error('[APP_LOG_FLUSH_FAILED]', error);
      }
    }
  }
}

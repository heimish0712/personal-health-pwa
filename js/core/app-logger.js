const MEMORY_QUEUE_LIMIT = 50;

function safeContext(context) {
  if (context == null) return null;

  try {
    const serialized = JSON.stringify(context);
    if (serialized.length <= 4000) return JSON.parse(serialized);
    return { truncated: true, preview: serialized.slice(0, 3900) };
  } catch {
    return { serializationFailed: true };
  }
}

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
    const entry = {
      level,
      event,
      message,
      context: safeContext(context)
    };

    const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'info';
    console[consoleMethod](`[${event}] ${message}`, context ?? '');

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

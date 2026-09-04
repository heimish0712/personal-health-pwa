import { IdentityNotReadyError } from './errors.js';

export class IdentityContext {
  #currentProfileId = null;

  setCurrentProfileId(profileId) {
    if (typeof profileId !== 'string' || profileId.length === 0) {
      throw new IdentityNotReadyError('IDENTITY_INVALID', 'A valid profile ID is required.');
    }
    this.#currentProfileId = profileId;
  }

  getCurrentProfileId() {
    if (!this.#currentProfileId) {
      throw new IdentityNotReadyError('IDENTITY_NOT_READY', 'The current profile is not initialized.');
    }
    return this.#currentProfileId;
  }

  peekCurrentProfileId() {
    return this.#currentProfileId;
  }

  clear() {
    this.#currentProfileId = null;
  }
}

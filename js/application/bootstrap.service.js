export class BootstrapService {
  #bootstrapCommand;
  #identityContext;

  constructor({ bootstrapCommand, identityContext }) {
    this.#bootstrapCommand = bootstrapCommand;
    this.#identityContext = identityContext;
  }

  async initialize() {
    const result = await this.#bootstrapCommand.initializeDeviceProfileAndSeed();
    this.#identityContext.setCurrentProfileId(result.profileId);
    return result;
  }
}

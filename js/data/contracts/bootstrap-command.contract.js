export class BootstrapCommandContract {
  async initializeDeviceProfileAndSeed() {
    throw new Error('BootstrapCommandContract.initializeDeviceProfileAndSeed must be implemented.');
  }

  async repairProfilePointer() {
    throw new Error('BootstrapCommandContract.repairProfilePointer must be implemented.');
  }

  async upgradeSeed(_profileId) {
    throw new Error('BootstrapCommandContract.upgradeSeed must be implemented.');
  }
}

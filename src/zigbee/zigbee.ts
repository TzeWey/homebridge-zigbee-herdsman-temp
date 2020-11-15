import { EventEmitter } from 'events';
import { Logger } from 'homebridge';
import { Controller } from 'zigbee-herdsman';
import stringify from 'json-stable-stringify-without-jsonify';
import { findByDevice } from 'zigbee-herdsman-converters';

import { ZigbeeConfig, ZigbeeEntity, ZigbeeDefinition, Device, DeviceType, Group, Events } from './types';

export class Zigbee extends EventEmitter {
  private herdsman!: Controller;

  constructor(private readonly config: ZigbeeConfig, private readonly log: Logger = console) {
    super();
    this.herdsman = new Controller({
      network: {
        panID: this.config.panID,
        extendedPanID: this.config.extendedPanID,
        channelList: [this.config.channel],
        networkKey: this.config.networkKey,
      },
      databasePath: this.config.databasePath,
      databaseBackupPath: this.config.databasePath + '.backup',
      backupPath: this.config.coordinatorBackupPath,
      serialPort: {
        baudRate: 115200,
        rtscts: false,
        path: this.config.port,
        adapter: 'zstack',
      },
      adapter: {
        concurrent: 16,
      },
      acceptJoiningDeviceHandler: (ieeeAddr) => this.acceptJoiningDeviceHandler(ieeeAddr),
    });
  }

  async start() {
    this.log.info('Starting zigbee-herdsman...');

    try {
      await this.herdsman.start();
    } catch (error) {
      this.log.error('Error while starting zigbee-herdsman');
      throw error;
    }

    this.log.info('zigbee-herdsman started');
    this.log.info(`Coordinator firmware version: '${stringify(await this.getCoordinatorVersion())}'`);
    this.log.debug(`Zigbee network parameters: ${stringify(await this.getNetworkParameters())}`);

    this.herdsman.on(Events.adapterDisconnected, () => this.emit(Events.adapterDisconnected));
    this.herdsman.on(Events.deviceAnnounce, (data) => this.emit(Events.deviceAnnounce, data));
    this.herdsman.on(Events.deviceInterview, (data) => this.emit(Events.deviceInterview, data));
    this.herdsman.on(Events.deviceJoined, (data) => this.emit(Events.deviceJoined, data));
    this.herdsman.on(Events.deviceLeave, (data) => this.emit(Events.deviceLeave, data));
    this.herdsman.on(Events.message, (data) => this.emit(Events.message, data));
    this.log.debug('Registered zigbee-herdsman event handlers');

    // Check if we have to turn off the led
    if (this.config.disableLED) {
      await this.herdsman.setLED(false);
    }

    // Check if we have to set a transmit power
    if (this.config.transmitPower) {
      await this.herdsman.setTransmitPower(this.config.transmitPower);
      this.log.info(`Set transmit power to '${this.config.transmitPower}'`);
    }
  }

  async stop() {
    await this.herdsman.stop();
    this.log.info('zigbee-herdsman stopped');
  }

  async acceptJoiningDeviceHandler(ieeeAddr: string) {
    this.log.info(`Accepting joining whitelisted device '${ieeeAddr}'`);
    return true;
  }

  async getCoordinatorVersion() {
    return this.herdsman.getCoordinatorVersion();
  }

  async getNetworkParameters() {
    return this.herdsman.getNetworkParameters();
  }

  async reset(type: 'soft' | 'hard') {
    await this.herdsman.reset(type);
  }

  async permitJoin(permit: boolean, resolvedEntity?: ZigbeeEntity) {
    permit
      ? this.log.info(`Zigbee: allowing new devices to join${resolvedEntity ? ` via ${resolvedEntity.name}` : ''}.`)
      : this.log.info('Zigbee: disabling joining new devices.');

    if (resolvedEntity && permit) {
      await this.herdsman.permitJoin(permit, resolvedEntity.device);
    } else {
      await this.herdsman.permitJoin(permit);
    }
  }

  async getPermitJoin() {
    return this.herdsman.getPermitJoin();
  }

  getClients() {
    return this.herdsman.getDevices().filter((device) => device.type !== 'Coordinator');
  }

  getDevices() {
    return this.herdsman.getDevices();
  }

  getDeviceByIeeeAddr(ieeeAddr: string) {
    return this.herdsman.getDeviceByIeeeAddr(ieeeAddr);
  }

  getDeviceByNetworkAddress(networkAddress: number) {
    return this.herdsman.getDeviceByNetworkAddress(networkAddress);
  }

  getDevicesByType(type: DeviceType): Device[] {
    return this.herdsman.getDevicesByType(type);
  }

  getGroupByID(ID: number) {
    return this.herdsman.getGroupByID(ID);
  }

  getGroups() {
    return this.herdsman.getGroups();
  }

  createGroup(groupID: number) {
    return this.herdsman.createGroup(groupID);
  }

  async touchlinkFactoryResetFirst() {
    return this.herdsman.touchlinkFactoryResetFirst();
  }

  async touchlinkFactoryReset(ieeeAddr: string, channel: number) {
    return this.herdsman.touchlinkFactoryReset(ieeeAddr, channel);
  }

  async touchlinkIdentify(ieeeAddr: string, channel: number) {
    await this.herdsman.touchlinkIdentify(ieeeAddr, channel);
  }

  async touchlinkScan() {
    return this.herdsman.touchlinkScan();
  }

  /**
   * @param {string} key
   * @return {object} {
   *      type: device | coordinator
   *      device|group: zigbee-herdsman entity
   *      endpoint: selected endpoint (only if type === device)
   *      settings: from configuration.yaml
   *      name: name of the entity
   *      definition: zigbee-herdsman-converters definition (only if type === device)
   * }
   */
  resolveEntity(key: string | number | Device | Group): ZigbeeEntity {
    if (key instanceof Device) {
      return {
        type: 'device',
        device: key,
        endpoint: key.endpoints[0],
        name: key.type === 'Coordinator' ? 'Coordinator' : key.ieeeAddr,
        definition: findByDevice(key) as ZigbeeDefinition,
      };
    }

    if (typeof key === 'string') {
      if (key.toLowerCase() === 'coordinator') {
        const coordinator = this.herdsman.getDevicesByType('Coordinator')[0];
        return {
          type: 'device',
          device: coordinator,
          endpoint: coordinator.getEndpoint(1),
          name: 'Coordinator',
        };
      }
    }

    this.log.error('Failed to resolve entity: ', key);
    return null!;
  }
}

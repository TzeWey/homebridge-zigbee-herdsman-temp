import {
  API,
  APIEvent,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import * as path from 'path';
import retry from 'async-retry';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Zigbee, ZigbeeEntity, ZigbeeConfigure, ZigbeeOnEvent, Events, MessagePayload, ZigbeePing } from './zigbee';
import { ZigbeeAccessory, ZigbeeAccessoryResolver } from './accessories';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ZigbeeHerdsmanPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  private readonly accessories = new Map<string, PlatformAccessory>();
  private readonly zigbeeAccessories = new Map<string, ZigbeeAccessory>();

  public readonly zigbee: Zigbee;
  public readonly zigbeeAccessoryResolver: ZigbeeAccessoryResolver;
  private readonly zigbeeConfigure: ZigbeeConfigure;
  private readonly zigbeeOnEvent: ZigbeeOnEvent;
  private readonly zigbeePing: ZigbeePing;

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    const databasePath = path.join(this.api.user.storagePath(), 'zigbee.db');
    const coordinatorBackupPath = path.join(this.api.user.storagePath(), 'coordinator.json');
    this.zigbee = new Zigbee(this.log, {
      port: '/dev/ttyNET3',
      disableLED: false,
      panID: 13662,
      extendedPanID: [0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd],
      channel: 11,
      networkKey: [0x01, 0x03, 0x05, 0x07, 0x09, 0x0b, 0x0d, 0x0f, 0x00, 0x02, 0x04, 0x06, 0x08, 0x0a, 0x0c, 0x0d],
      databasePath,
      coordinatorBackupPath,
    });

    this.zigbeeAccessoryResolver = new ZigbeeAccessoryResolver(this);

    this.zigbeeConfigure = new ZigbeeConfigure(this, this.zigbee);
    this.zigbeeOnEvent = new ZigbeeOnEvent(this, this.zigbee);
    this.zigbeePing = new ZigbeePing(this, this.zigbee);

    this.zigbee.on(Events.adapterDisconnected, this.onZigbeeAdapterDisconnected.bind(this));
    this.zigbee.on(Events.message, this.onZigbeeMessage.bind(this));

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, this.start.bind(this));
    this.api.on(APIEvent.SHUTDOWN, this.stop.bind(this));

    this.log.debug('Finished initializing platform:', this.config.name);
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  private async start() {
    try {
      await retry(
        async () => {
          await this.zigbee.start();
        },
        {
          retries: 10,
          minTimeout: 1000,
          maxTimeout: 8000,
          onRetry: () => this.log.info('Retrying connect to Zigbee hardware'),
        },
      );
    } catch (error) {
      this.log.error('Zigbee Start:', error);
    }

    this.cleanupDevices();
    this.discoverDevices();
    this.log.info('Started platform:', this.config.name);
  }

  private async stop() {
    await this.zigbee.stop();
    this.log.info('Stopped platform:', this.config.name);
  }

  private async onZigbeeAdapterDisconnected() {
    this.log.error('Adapter disconnected, stopping Zigbee');
    await this.stop();
  }

  private async onZigbeeMessage(data: MessagePayload, resolvedEntity: ZigbeeEntity) {
    const device = resolvedEntity.device;
    if (!device) {
      return;
    }

    const uuid = this.api.hap.uuid.generate(device.ieeeAddr);
    const zigbeeAccessory = this.zigbeeAccessories.get(uuid);
    if (!zigbeeAccessory) {
      this.log.debug(`could not find accessory ${uuid} [${device.ieeeAddr}]`);
      return;
    }

    await zigbeeAccessory.processMessage(data);
  }

  /**
   * We use the Zigbee database as the source of truth, this routine will remove
   * cached devices which are not longer found in the adapter database
   */
  private cleanupDevices() {
    const removed: string[] = [];
    const zigbeeDevices = this.zigbee.getDevices();
    const uuids = zigbeeDevices.map((e) => this.api.hap.uuid.generate(e.ieeeAddr));

    this.accessories.forEach((cachedAccessory) => {
      if (!uuids.includes(cachedAccessory.UUID)) {
        this.log.info('Removing existing accessory from cache:', cachedAccessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cachedAccessory]);
        removed.push(cachedAccessory.UUID);
      }
    });

    removed.forEach((uuid) => this.accessories.delete(uuid));
  }

  private async discoverDevices() {
    // Loop through each known Zigbee Device
    this.zigbee.getDevices().forEach((device) => {
      // Do not associate Coordinators with accessories
      if (device.type === 'Coordinator') {
        return;
      }

      const uuid = this.api.hap.uuid.generate(device.ieeeAddr);
      this.log.info(`Initializing device ${device.ieeeAddr} [${uuid}]`);

      const ZigbeeAccessory = this.zigbeeAccessoryResolver.getAccessoryClass(device);
      if (!ZigbeeAccessory) {
        this.log.warn('Unrecognized device:', device);
        return;
      }

      const existingAccessory = this.accessories.get(uuid);
      if (existingAccessory) {
        this.log.info(`> Restoring existing accessory from cache: ${existingAccessory.displayName}`);

        // Update accessory cache with any changes to the accessory details and information
        const zigbeeAccessory = new ZigbeeAccessory(this, existingAccessory, device);
        this.zigbeeAccessories.set(uuid, zigbeeAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
      } else {
        this.log.info(`> Adding new accessory: ${device.modelID}`);

        // Create a new accessory and link the accessory to the platform
        const accessory = new this.api.platformAccessory(device.ieeeAddr, uuid);
        const zigbeeAccessory = new ZigbeeAccessory(this, accessory, device);
        this.zigbeeAccessories.set(uuid, zigbeeAccessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    });
  }
}

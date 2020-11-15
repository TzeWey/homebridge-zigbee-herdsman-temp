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
import stringify from 'json-stable-stringify-without-jsonify';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ExamplePlatformAccessory, TestSwitch } from './platformAccessory';
import {
  Zigbee,
  Events,
  MessagePayload,
  DeviceJoinedPayload,
  DeviceInterviewPayload,
  DeviceAnnouncePayload,
  DeviceLeavePayload,
} from './zigbee';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ZigbeeHerdsmanPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  public readonly test: ExamplePlatformAccessory[] = [];
  private testSwitch!: TestSwitch;

  private zigbee: Zigbee;

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    const databasePath = path.join(this.api.user.storagePath(), 'zigbee.db');
    this.zigbee = new Zigbee(
      {
        port: '/dev/ttyNET3',
        disableLED: false,
        panID: 13662,
        extendedPanID: [0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd],
        channel: 11,
        networkKey: [0x01, 0x03, 0x05, 0x07, 0x09, 0x0b, 0x0d, 0x0f, 0x00, 0x02, 0x04, 0x06, 0x08, 0x0a, 0x0c, 0x0d],
        databasePath,
        coordinatorBackupPath: databasePath + '.backup',
      },
      this.log,
    );

    this.zigbee.on(Events.adapterDisconnected, this.onZigbeeAdapterDisconnected.bind(this));
    this.zigbee.on(Events.message, this.onZigbeeMessage.bind(this));
    this.zigbee.on(Events.deviceJoined, this.onZigbeeDeviceJoined.bind(this));
    this.zigbee.on(Events.deviceInterview, this.onZigbeeDeviceInterview.bind(this));
    this.zigbee.on(Events.deviceAnnounce, this.onZigbeeDeviceAnnounce.bind(this));
    this.zigbee.on(Events.deviceLeave, this.onZigbeeDeviceLeave.bind(this));

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

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
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

    this.discoverDevices();
    for (const device of this.zigbee.getDevices()) {
      this.log.info('device:', device.ieeeAddr, device.manufacturerName, device.modelID);
    }
    this.zigbee.permitJoin(true);

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

  private async onZigbeeMessage(data: MessagePayload) {
    const name = data.device && data.device.ieeeAddr;
    this.log.debug(
      `Received Zigbee message from '${name}', type '${data.type}', cluster '${data.cluster}'` +
        `, data '${stringify(data.data)}' from endpoint ${data.endpoint.ID}` +
        (data.groupID ? ` with groupID ${data.groupID}` : ''),
    );

    // this.log.info('data: ', data);
    // this.log.info('resolvedEntity: ', resolvedEntity);
    this.testSwitch.trigger();
  }

  private async onZigbeeDeviceJoined(data: DeviceJoinedPayload) {
    const name = data.device && data.device.ieeeAddr;
    this.log.info(`Device '${name}' joined`);
  }

  private async onZigbeeDeviceInterview(data: DeviceInterviewPayload) {
    const resolvedEntity = this.zigbee.resolveEntity(data.device);
    const name = data.device && data.device.ieeeAddr;

    switch (data.status) {
      case 'successful':
        this.log.info(`Successfully interviewed '${name}', device has successfully been paired`);
        if (resolvedEntity.definition) {
          const { vendor, description, model } = resolvedEntity.definition;
          this.log.info(`Device '${name}' is supported, identified as: ${vendor} ${description} (${model})`);
        } else {
          this.log.warn(
            `Device '${name}' with Zigbee model '${data.device.modelID}' is NOT supported, ` +
              'please follow https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html',
          );
        }
        break;

      case 'failed':
        this.log.error(`Failed to interview '${name}', device has not successfully been paired`);
        break;

      case 'started':
        this.log.info(`Starting interview of '${name}'`);
        break;

      default:
        this.log.error('Unknown DeviceInterview state!');
        break;
    }
  }

  private async onZigbeeDeviceAnnounce(data: DeviceAnnouncePayload) {
    const name = data.device && data.device.ieeeAddr;
    this.log.debug(`Device '${name}' announced itself`);
  }

  private async onZigbeeDeviceLeave(data: DeviceLeavePayload) {
    this.log.warn(`Device '${data.ieeeAddr}' left the network`);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  private async discoverDevices() {
    // EXAMPLE ONLY
    // A real plugin you would discover accessories from the local network, cloud services
    // or a user-defined array in the platform config.
    const exampleDevices = [
      {
        exampleUniqueId: 'ABCD',
        exampleDisplayName: 'Bedroom',
      },
      {
        exampleUniqueId: 'EFGH',
        exampleDisplayName: 'Kitchen',
      },
      {
        exampleUniqueId: 'IJKL1',
        exampleDisplayName: 'Switch',
      },
    ];

    for (const existingAccessory of this.accessories) {
      if (!exampleDevices.find((a) => this.api.hap.uuid.generate(a.exampleUniqueId) === existingAccessory.UUID)) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      }
    }

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of exampleDevices) {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.exampleUniqueId);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        if (device) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

          // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
          // existingAccessory.context.device = device;
          // this.api.updatePlatformAccessories([existingAccessory]);

          // create the accessory handler for the restored accessory
          // this is imported from `platformAccessory.ts`
          if (device.exampleDisplayName === 'Switch') {
            this.testSwitch = new TestSwitch(this, existingAccessory);
          } else {
            const x = new ExamplePlatformAccessory(this, existingAccessory);
            this.test.push(x);
          }

          // update accessory cache with any changes to the accessory details and information
          this.api.updatePlatformAccessories([existingAccessory]);
        } else if (!device) {
          // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
          // remove platform accessories when no longer present
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
        }
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.exampleDisplayName);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.exampleDisplayName, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`

        if (device.exampleDisplayName === 'Switch') {
          this.testSwitch = new TestSwitch(this, accessory);
        } else {
          const x = new ExamplePlatformAccessory(this, accessory);
          this.test.push(x);
        }

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}

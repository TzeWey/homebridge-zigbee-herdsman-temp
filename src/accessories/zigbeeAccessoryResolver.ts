import { Logger, PlatformAccessory } from 'homebridge';
import { findByDevice } from 'zigbee-herdsman-converters';

import { ZigbeeHerdsmanPlatform } from '../platform';
import { Device } from '../zigbee';
import { ZigbeeAccessory } from './zigbeeAccessory';

import { GenericOutlet } from './generic';
import { IkeaMotionSensor, IkeaOnOffSwitch, IkeaTadfriDimColor } from './ikea';
import { TuyaOnOffTripleSwitch } from './tuya';

export interface ZigbeeAccessoryCtor {
  new (platform: ZigbeeHerdsmanPlatform, accessory: PlatformAccessory, device: Device): ZigbeeAccessory;
}

export class ZigbeeAccessoryResolver {
  private readonly log: Logger = this.platform.log;
  private readonly registry: Map<string, ZigbeeAccessoryCtor> = new Map();

  constructor(private readonly platform: ZigbeeHerdsmanPlatform) {
    let vendor: string;

    /*
     * TuYa
     */
    vendor = 'TuYa';
    this.registerResolver(vendor, ['TS0043'], TuyaOnOffTripleSwitch);
    this.registerResolver(vendor, ['TS011F_socket_module'], GenericOutlet);

    /*
     * IKEA
     */
    vendor = 'IKEA';
    this.registerResolver(vendor, ['E1603/E1702'], GenericOutlet);
    this.registerResolver(vendor, ['E1525/E1745'], IkeaMotionSensor);
    this.registerResolver(vendor, ['E1743'], IkeaOnOffSwitch);
    this.registerResolver(vendor, ['LED1624G9'], IkeaTadfriDimColor);
  }

  private getKey(vendor: string, model: string) {
    return `${vendor}:${model}`;
  }

  private registerResolver(vendor: string, models: string[], ctor: ZigbeeAccessoryCtor) {
    models.forEach((model) => this.registry.set(this.getKey(vendor, model), ctor));
  }

  public getAccessoryClass(device: Device): ZigbeeAccessoryCtor | undefined {
    const definition = findByDevice(device);
    if (!definition) {
      this.log.warn(
        `Unable to resolve definition for '${device.ieeeAddr}' [${device.manufacturerName}:${device.modelID}] `,
      );
      return undefined;
    }

    const key = this.getKey(definition.vendor, definition.model);
    const ctor = this.registry.get(key);

    if (!ctor) {
      this.log.warn(
        `Unable to resolve accessory class for '${device.ieeeAddr}' [${definition.vendor}:${definition.model}] `,
      );
      return undefined;
    }

    return ctor;
  }
}

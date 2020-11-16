import { Logger, PlatformAccessory } from 'homebridge';
import { findByDevice } from 'zigbee-herdsman-converters';

import { ZigbeeHerdsmanPlatform } from '../platform';
import { Device } from '../zigbee';
import { ZigbeeAccessory } from './zigbeeAccessory';

import { IkeaTadfriDim, IkeaTadfriDimColor } from './ikea';

export interface ZigbeeAccessoryResolverCtor {
  new (platform: ZigbeeHerdsmanPlatform, accessory: PlatformAccessory, device: Device): ZigbeeAccessory;
}

export class ZigbeeAccessoryResolver {
  private readonly log: Logger = this.platform.log;
  private readonly registry: Map<string, ZigbeeAccessoryResolverCtor> = new Map();

  constructor(private readonly platform: ZigbeeHerdsmanPlatform) {
    let vendor: string;

    /*
     * GLEDOPTO
     */
    vendor = 'GLEDOPTO';
    this.registerResolver(vendor, ['GL-C-009'], IkeaTadfriDim);

    /*
     * IKEA
     */
    vendor = 'IKEA';
    this.registerResolver(vendor, ['LED1624G9'], IkeaTadfriDimColor);
  }

  private getKey(vendor: string, model: string) {
    return `${vendor}:${model}`;
  }

  private registerResolver(vendor: string, models: string[], ctor: ZigbeeAccessoryResolverCtor) {
    models.forEach((model) => this.registry.set(this.getKey(vendor, model), ctor));
  }

  public getAccessoryClass(device: Device): ZigbeeAccessoryResolverCtor | undefined {
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

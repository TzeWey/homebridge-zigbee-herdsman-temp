import { Logger, Service, PlatformAccessory } from 'homebridge';
import { ZigbeeHerdsmanPlatform } from '../platform';
import { ZigbeeAccessory } from '../accessories';

export abstract class ServiceBuilder {
  protected readonly platform: ZigbeeHerdsmanPlatform = this.zigbeeAccessory.platform;
  protected readonly accessory: PlatformAccessory = this.zigbeeAccessory.accessory;
  protected readonly log: Logger = this.platform.log;
  protected service!: Service;

  protected constructor(protected readonly zigbeeAccessory: ZigbeeAccessory) {}

  public build(): Service {
    return this.service;
  }
}

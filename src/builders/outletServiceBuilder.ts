import {
  CharacteristicValue,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
} from 'homebridge';

import { ZigbeeAccessory } from '../accessories';
import { ServiceBuilder } from './serviceBuilder';

export class OutletServiceBuilder extends ServiceBuilder {
  constructor(protected readonly zigbeeAccessory: ZigbeeAccessory) {
    super(zigbeeAccessory);
    this.service =
      this.accessory.getService(this.platform.Service.Outlet) ||
      this.accessory.addService(this.platform.Service.Outlet);
  }

  public withOnOff(): OutletServiceBuilder {
    const Characteristic = this.platform.Characteristic;

    this.service
      .getCharacteristic(Characteristic.On)
      .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        try {
          const on = value as boolean;
          await this.setOn(on);
          callback();
        } catch (e) {
          callback(e);
        }
      })
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        try {
          const state = await this.getOnOffState();
          this.log.info(`Reporting state for ${this.accessory.displayName}: ${state}`);
          callback(null, state);
        } catch (e) {
          callback(e);
        }
      });

    return this;
  }
}

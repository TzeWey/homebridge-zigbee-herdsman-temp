import {
  CharacteristicValue,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
} from 'homebridge';

import { ZigbeeAccessory } from '../accessories';
import { ServiceBuilder } from './serviceBuilder';
import { HSBType } from '../util/hsbType';

export class LighbulbServiceBuilder extends ServiceBuilder {
  constructor(protected readonly zigbeeAccessory: ZigbeeAccessory) {
    super(zigbeeAccessory);
    this.service =
      this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);
  }

  /**
   * Private Functions
   */
  private async setOn(on: boolean) {
    return await this.zigbeeAccessory.setDeviceState({ state: on ? 'ON' : 'OFF' });
  }

  private async getOnOffState() {
    const payload = await this.zigbeeAccessory.getDeviceState({ state: 'ON' });
    return payload.state === 'ON';
  }

  private async setBrightnessPercent(brightness_percent: number) {
    const brightness = Math.round(Number(brightness_percent) * 2.55);
    return await this.zigbeeAccessory.setDeviceState({ brightness });
  }

  private async getBrightnessPercent() {
    const payload = await this.zigbeeAccessory.getDeviceState({ brightness: 0 });
    return Math.round(Number(payload.brightness) / 2.55);
  }

  private async setColorTemperature(colorTemperature: number) {
    return await this.zigbeeAccessory.setDeviceState({ color_temp: colorTemperature });
  }

  private async getColorTemperature() {
    const payload = await this.zigbeeAccessory.getDeviceState({ color_temp: 0 });
    return payload.color_temp;
  }

  private async setHue(hue: number) {
    return await this.zigbeeAccessory.setDeviceState({ color: { hue } });
  }

  private async getHue() {
    const payload = await this.zigbeeAccessory.getDeviceState({ color: { hue: 0 } });
    return payload.color.hue;
  }

  private async setColorXY(x: number, y: number) {
    return await this.zigbeeAccessory.setDeviceState({ color: { x, y } });
  }

  private async getColorXY() {
    const payload = await this.zigbeeAccessory.getDeviceState({ color: { x: 0, y: 0 } });
    return payload.color;
  }

  private async setColorRGB(r: number, g: number, b: number) {
    return await this.zigbeeAccessory.setDeviceState({ color: { rgb: `${r},${g},${b}` } });
  }

  private async setSaturation(saturation: number) {
    return await this.zigbeeAccessory.setDeviceState({ color: { s: saturation } });
  }

  private async getSaturation() {
    const payload = await this.zigbeeAccessory.getDeviceState({ color: { s: 0 } });
    return payload.color.s;
  }

  /**
   * Public Builder Functions
   */
  public withOnOff(): LighbulbServiceBuilder {
    const Characteristic = this.platform.Characteristic;

    this.service
      .getCharacteristic(Characteristic.On)
      .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        try {
          const state = await this.setOn(value === true);
          this.log.info(`New state for ${this.accessory.displayName}`, state);
          callback();
        } catch (e) {
          callback(e);
        }
      });

    this.service
      .getCharacteristic(Characteristic.On)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        try {
          const state = await this.getOnOffState();
          this.log.debug(`Reporting ${state ? 'ON' : 'OFF'} for ${this.accessory.displayName}`);
          callback(null, state);
        } catch (e) {
          callback(e);
        }
      });

    return this;
  }

  public withBrightness(): LighbulbServiceBuilder {
    const Characteristic = this.platform.Characteristic;

    this.service
      .getCharacteristic(Characteristic.Brightness)
      .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        const brightness_percent = value as number;
        try {
          const state = await this.setBrightnessPercent(brightness_percent);
          this.log.debug(`Set Brightness for ${this.accessory.displayName}`, state.brightness);
          callback();
        } catch (e) {
          callback(e);
        }
      });

    this.service
      .getCharacteristic(Characteristic.Brightness)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        try {
          const brightness_percent = await this.getBrightnessPercent();
          this.log.debug(`Reporting Brightness for ${this.accessory.displayName}`, brightness_percent);
          callback(null, brightness_percent);
        } catch (e) {
          callback(e);
        }
      });
    return this;
  }

  public withColorTemperature(): LighbulbServiceBuilder {
    const Characteristic = this.platform.Characteristic;

    this.service
      .getCharacteristic(Characteristic.ColorTemperature)
      .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        try {
          const colorTemperature = value as number;
          const state = await this.setColorTemperature(colorTemperature);
          callback();
        } catch (e) {
          callback(e);
        }
      });

    this.service
      .getCharacteristic(Characteristic.ColorTemperature)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        try {
          const color_temp = await this.getColorTemperature();
          callback(null, color_temp);
        } catch (e) {
          callback(e);
        }
      });

    return this;
  }

  public withHue(): LighbulbServiceBuilder {
    const Characteristic = this.platform.Characteristic;

    this.service
      .getCharacteristic(Characteristic.Hue)
      .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        try {
          const hue = value as number;
          const state = await this.setHue(hue);
          callback();
        } catch (e) {
          callback(e);
        }
      });

    this.service
      .getCharacteristic(Characteristic.Hue)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        try {
          const hue = await this.getHue();
          callback(null, hue);
        } catch (e) {
          callback(e);
        }
      });

    return this;
  }

  /**
   * Special treatment for bulbs supporting only XY colors (IKEA Tådfri for example)
   * HomeKit only knows about HSB, so we need to manually convert values
   */
  public withColorXY(): LighbulbServiceBuilder {
    const Characteristic = this.platform.Characteristic;

    // this.service
    //   .getCharacteristic(Characteristic.Hue)
    //   .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
    //     try {
    //       const h = value as number;
    //       const s = this.service.getCharacteristic(Characteristic.Saturation).value as number;
    //       const v = this.service.getCharacteristic(Characteristic.Brightness).value as number;
    //       const hsbType = new HSBType(h, s, v);
    //       const [r, g, b] = hsbType.toRGBBytes();
    //       const state = await this.setColorRGB(r, g, b);
    //       callback();
    //     } catch (e) {
    //       callback(e);
    //     }
    //   });
    // this.service
    //   .getCharacteristic(Characteristic.Hue)
    //   .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
    //     try {
    //       const color = await this.getColorXY();
    //       const Y = (this.service.getCharacteristic(Characteristic.Brightness).value as number) / 100;
    //       const hsbType = HSBType.fromXY(color.x, color.y, Y);
    //       const hue = hsbType.hue;
    //       this.service.updateCharacteristic(Characteristic.Saturation, hsbType.saturation);
    //       callback(null, hue);
    //     } catch (e) {
    //       callback(e);
    //     }
    //   });

    this.service
      .getCharacteristic(Characteristic.Saturation)
      .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        try {
          const saturation = value as number;
          const v = this.service.getCharacteristic(Characteristic.Brightness).value as number;
          const hue = this.service.getCharacteristic(Characteristic.Hue).value as number;
          const hsbType = new HSBType(hue, saturation, v);
          const [r, g, b] = hsbType.toRGBBytes();
          await this.setColorRGB(r, g, b);
          callback();
        } catch (e) {
          callback(e);
        }
      });

    this.service
      .getCharacteristic(Characteristic.Saturation)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        try {
          const color = await this.getColorXY();
          const Y = (this.service.getCharacteristic(Characteristic.Brightness).value as number) / 100;
          const hsbType = HSBType.fromXY(color.x, color.y, Y);
          this.service.updateCharacteristic(Characteristic.Hue, hsbType.hue);
          callback(null, hsbType.saturation);
        } catch (e) {
          callback(e);
        }
      });

    return this;
  }

  public withSaturation(): LighbulbServiceBuilder {
    const Characteristic = this.platform.Characteristic;

    this.service
      .getCharacteristic(Characteristic.Saturation)
      .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        try {
          const saturation = value as number;
          await this.setSaturation(saturation);
          callback();
        } catch (e) {
          callback(e);
        }
      });
    this.service
      .getCharacteristic(Characteristic.Saturation)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        try {
          const saturation = await this.getSaturation();
          callback(null, saturation);
        } catch (e) {
          callback(e);
        }
      });

    return this;
  }
}

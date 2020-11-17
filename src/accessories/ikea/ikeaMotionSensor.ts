import {
  Service,
  CharacteristicValue,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
} from 'homebridge';
import { ZigbeeAccessory } from '../zigbeeAccessory';
import { BatteryServiceBuilder } from '../../builders';

export class IkeaMotionSensor extends ZigbeeAccessory {
  private sensorService!: Service;
  private batteryService!: Service;

  resolveServices(): Service[] {
    const Service = this.platform.api.hap.Service;
    const Characteristic = this.platform.api.hap.Characteristic;

    this.sensorService =
      this.accessory.getService(Service.MotionSensor) || this.accessory.addService(Service.MotionSensor);

    this.sensorService
      .getCharacteristic(Characteristic.MotionDetected)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        callback(null, this.state.occupancy);
      });

    this.sensorService
      .getCharacteristic(Characteristic.StatusLowBattery)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        callback(
          null,
          this.state.battery && this.state.battery <= 10
            ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
        );
      });

    this.batteryService = new BatteryServiceBuilder(this).build();

    return [this.sensorService, this.batteryService];
  }

  public async onStateUpdate(state: { occupancy: boolean; battery: number }) {
    const Characteristic = this.platform.Characteristic;

    this.sensorService.updateCharacteristic(Characteristic.MotionDetected, state.occupancy);
    this.sensorService.updateCharacteristic(
      Characteristic.StatusLowBattery,
      state.battery && state.battery <= 10
        ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    );

    this.batteryService.updateCharacteristic(Characteristic.BatteryLevel, state.battery);
  }
}

import { Service, CharacteristicEventTypes, CharacteristicGetCallback } from 'homebridge';
import { ZigbeeAccessory } from '../zigbeeAccessory';
import { BatteryServiceBuilder } from '../../builders';

export class IkeaMotionSensor extends ZigbeeAccessory {
  private sensorService!: Service;
  private batteryService!: Service;

  protected resolveServices(): Service[] {
    const Service = this.platform.api.hap.Service;
    const Characteristic = this.platform.api.hap.Characteristic;

    this.sensorService =
      this.accessory.getService(Service.MotionSensor) || this.accessory.addService(Service.MotionSensor);

    this.sensorService
      .getCharacteristic(Characteristic.MotionDetected)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        callback(null, this.state.occupancy);
      });

    this.batteryService = new BatteryServiceBuilder(this).build();

    return [this.sensorService, this.batteryService];
  }

  protected async onStateUpdate(state: { occupancy?: boolean }) {
    const Characteristic = this.platform.Characteristic;

    if (state.occupancy) {
      this.log.info('IkeaMotionSensor: MotionDetected:', state.occupancy);
      this.sensorService.updateCharacteristic(Characteristic.MotionDetected, state.occupancy);
    }
  }

  protected async onIdentify() {
    // do nothing
  }
}

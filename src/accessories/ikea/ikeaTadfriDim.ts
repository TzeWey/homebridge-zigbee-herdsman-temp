import { ZigbeeAccessory } from '../zigbeeAccessory';
import { LighbulbServiceBuilder } from '../../builders';
import { Service } from 'homebridge';

export class IkeaTadfriDim extends ZigbeeAccessory {
  protected service!: Service;

  resolveServices() {
    this.service = new LighbulbServiceBuilder(this).withOnOff().withBrightness().build();
    return [this.service];
  }
}

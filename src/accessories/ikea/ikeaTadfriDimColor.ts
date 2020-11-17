import { Service } from 'homebridge';
import { ZigbeeAccessory } from '../zigbeeAccessory';
import { LighbulbServiceBuilder } from '../../builders';

export class IkeaTadfriDimColor extends ZigbeeAccessory {
  protected service!: Service;

  resolveServices() {
    this.service = new LighbulbServiceBuilder(this).withOnOff().withBrightness().withColorXY().build();
    return [this.service];
  }
}

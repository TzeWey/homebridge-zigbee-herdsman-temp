import Device from 'zigbee-herdsman/dist/controller/model/device';
import Endpoint from 'zigbee-herdsman/dist/controller/model/endpoint';
import Group from 'zigbee-herdsman/dist/controller/model/group';
export { Device, Endpoint, Group };

export {
  Events,
  MessagePayload,
  DeviceJoinedPayload,
  DeviceInterviewPayload,
  DeviceAnnouncePayload,
  DeviceLeavePayload,
} from 'zigbee-herdsman/dist/controller/events';
export { DeviceType } from 'zigbee-herdsman/dist/controller/tstype';

export interface ZigbeeConfig {
  port: string;
  disableLED: boolean;

  panID: number;
  extendedPanID: number[];
  channel: number;
  networkKey: number[];
  transmitPower?: number;

  databasePath: string;
  coordinatorBackupPath: string;
}

export interface ZigbeeDefinition {
  zigbeeModel: string[];
  model: string;
  vendor: string;
  description: string;
  supports?: string;
  fromZigbee: any[];
  toZigbee: any[];
  meta?: {
    supportsHueAndSaturation?: boolean;
    configureKey?: number;
    disableDefaultResponse?: boolean;
    applyRedFix?: boolean;
    enhancedHue?: boolean;
    multiEndpoint?: boolean;
    timeout?: number;
  };
  configure?: (device: Device, coordinatorEndpoint: Endpoint) => Promise<void>;

  [key: string]: any;
}

export interface ZigbeeEntity {
  type: 'device' | 'coordinator';
  device?: Device;
  group?: Group;
  endpoint?: Endpoint;
  name: string;
  definition?: ZigbeeDefinition;
}

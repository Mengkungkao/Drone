import type { AdapterDescriptor } from './types';

/** Architecture metadata for the browser shell; these are not connected adapters. */
export const adapterDescriptors: AdapterDescriptor[] = [
  { id: 'betaflight', name: 'Betaflight Adapter', protocol: 'MSP / USB serial', target: 'Real FC',
    status: 'planned', reason: 'Phase 1: verified board identity, read-only configuration and live gyro.', capabilities: [] },
  { id: 'px4', name: 'PX4 Adapter', protocol: 'MAVLink / MAVSDK', target: 'PX4 FC / SITL',
    status: 'planned', reason: 'Phase 2: bind the retained MAVSDK harness to the application interface.', capabilities: [] },
  { id: 'gazebo', name: 'Simulation Engine', protocol: 'Gazebo Harmonic', target: 'X500',
    status: 'planned', reason: 'Independent physics and process lifecycle; requires the verified Ubuntu runtime.', capabilities: [] },
];

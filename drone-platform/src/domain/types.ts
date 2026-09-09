/** Domain contracts shared by desktop views and the native application gateway. */
export type FirmwareFamily = 'betaflight' | 'px4' | 'ardupilot' | 'custom';
export type ProjectKind = 'physical' | 'simulated';
export type ConfigurationValues = Record<string, string | number | boolean>;

export interface CreateProjectInput {
  name: string;
  kind: ProjectKind;
  firmware: FirmwareFamily;
  description: string;
}

export interface DroneProject extends CreateProjectInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  configurationRevision: number;
}

export interface ConfigurationSnapshot {
  id: string;
  projectId: string;
  revision: number;
  label: string;
  values: ConfigurationValues;
  createdAt: string;
}

export type SafetyState =
  | 'DISCONNECTED' | 'CONNECTED' | 'READ_ONLY' | 'CONFIGURATION'
  | 'SIMULATION' | 'SITL' | 'HITL' | 'BENCH_TEST'
  | 'READY_FOR_FLIGHT' | 'FLIGHT_TEST' | 'FAULT' | 'EMERGENCY_STOP';

export interface SafetyStatus {
  state: SafetyState;
  reason: string;
}

export interface AdapterDescriptor {
  id: string;
  name: string;
  protocol: string;
  target: string;
  status: 'unavailable' | 'planned';
  reason: string;
  capabilities: string[];
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  operation: string;
  message: string;
}

export interface WorkspaceState {
  projects: DroneProject[];
  selectedProjectId: string | null;
  safety: SafetyStatus;
  adapters: AdapterDescriptor[];
  logs: AuditEvent[];
}

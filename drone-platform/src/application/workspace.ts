import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  ConfigurationSnapshot, ConfigurationValues, CreateProjectInput, DroneProject,
  SafetyState, SafetyStatus, WorkspaceState,
} from '../domain/types';

export class WorkspaceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

/** IPC is the only persistence / system boundary. There is no simulated backend. */
export class WorkspaceClient {
  constructor(readonly isNative: boolean, private readonly send: Invoke) {}

  private async command<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    if (!this.isNative) {
      throw new WorkspaceError('NATIVE_REQUIRED', 'Open the DroneLab desktop app to access SQLite projects. This browser preview has no native backend.');
    }
    try {
      return await this.send<T>(command, args);
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      const message = error instanceof Error ? error.message
        : typeof error === 'string' ? error
        : error && typeof error === 'object' && 'message' in error ? String(error.message)
        : 'The native operation failed. Check the DroneLab audit log.';
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'NATIVE_ERROR';
      throw new WorkspaceError(code, message);
    }
  }

  getWorkspace(): Promise<WorkspaceState> { return this.command('get_workspace'); }
  createProject(input: CreateProjectInput): Promise<DroneProject> { return this.command('create_project', { input }); }
  selectProject(projectId: string): Promise<DroneProject> { return this.command('select_project', { projectId }); }
  saveSnapshot(projectId: string, label: string, values: ConfigurationValues): Promise<ConfigurationSnapshot> {
    return this.command('save_snapshot', { projectId, label, values });
  }
  listSnapshots(projectId: string): Promise<ConfigurationSnapshot[]> { return this.command('list_snapshots', { projectId }); }
  setSafetyState(state: SafetyState): Promise<SafetyStatus> { return this.command('set_safety_state', { state }); }
}

export const workspace = new WorkspaceClient(isTauri(), invoke);

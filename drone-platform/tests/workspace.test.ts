import { describe, expect, it, vi } from 'vitest';
import { WorkspaceClient } from '../src/application/workspace';

describe('native application boundary (isolated unit doubles, no integration claims)', () => {
  it('rejects every operation without a native runtime instead of inventing persisted data', async () => {
    const invoke = vi.fn();
    const client = new WorkspaceClient(false, invoke);
    for (const operation of [
      () => client.getWorkspace(),
      () => client.createProject({ name: 'Test', kind: 'physical', firmware: 'betaflight', description: '' }),
      () => client.selectProject('id'),
      () => client.saveSnapshot('id', 'initial', {}),
      () => client.listSnapshots('id'),
      () => client.setSafetyState('DISCONNECTED'),
    ]) await expect(operation()).rejects.toMatchObject({ code: 'NATIVE_REQUIRED' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('preserves useful native validation errors', async () => {
    const invoke = vi.fn().mockRejectedValue({ code: 'INVALID_INPUT', message: 'Project name is required' });
    await expect(new WorkspaceClient(true, invoke).getWorkspace())
      .rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'Project name is required' });
  });

  it('does not turn failed persistence into successful local updates', async () => {
    const invoke = vi.fn().mockRejectedValue('database is locked');
    const client = new WorkspaceClient(true, invoke);
    await expect(client.saveSnapshot('id', 'candidate', { mass: 1.5 })).rejects.toThrow('database is locked');
    expect(invoke).toHaveBeenCalledOnce();
  });
});

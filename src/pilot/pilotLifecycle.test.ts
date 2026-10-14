import { describe, expect, it, vi } from 'vitest';
import { flushPilotWorkspace, registerPilotSave } from './pilotLifecycle';

describe('pilot logout durability', () => {
  it('waits for pending workspace writes before the caller can sign out', async () => {
    let finish!: () => void;
    const save = new Promise<void>(resolve => { finish = resolve; });
    const unregister = registerPilotSave(() => save);
    const done = vi.fn();
    const logout = flushPilotWorkspace().then(done);
    await Promise.resolve(); expect(done).not.toHaveBeenCalled();
    finish(); await logout; expect(done).toHaveBeenCalledOnce();
    unregister();
  });
  it('propagates save failures so signout can leave the workspace available for retry', async () => {
    const unregister = registerPilotSave(async () => { throw new Error('disk unavailable'); });
    await expect(flushPilotWorkspace()).rejects.toThrow('disk unavailable');
    unregister(); await expect(flushPilotWorkspace()).resolves.toBeUndefined();
  });
});

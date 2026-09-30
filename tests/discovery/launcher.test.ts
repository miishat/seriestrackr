// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
import { launchDevelopment } from '../../scripts/dev-all.mjs';

class Child extends EventEmitter {
  connected = true;
  send = vi.fn(() => true);
  kill = vi.fn(() => true);
}
function fixture() {
  const children: Child[] = []; const host = new EventEmitter();
  const spawn = vi.fn(() => { const child = new Child(); children.push(child); return child; });
  const launch = launchDevelopment({ spawn, host, shutdownMs: 50 });
  return { children, host, spawn, launch };
}
afterEach(() => { vi.useRealTimers(); });
test('launches exactly local Node children with IPC and no shell, detachment or visible window', async () => {
  const { children, host, spawn, launch } = fixture();
  expect(spawn).toHaveBeenCalledTimes(2);
  for (const [command, args, options] of spawn.mock.calls as unknown as [string, string[], Record<string, unknown>][]) {
    expect(command).toBe(process.execPath); expect(args).toContain('--import');
    expect(options).toMatchObject({ shell: false, windowsHide: true, detached: false, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    expect(options).not.toHaveProperty('env');
  }
  const calls = spawn.mock.calls as unknown as [string, string[]][];
  expect(calls[0][1].at(-1)).toMatch(/vite[\\/]bin[\\/]vite\.js$/);
  expect(calls[1][1].join(' ')).toContain('tsx'); expect(calls[1][1].at(-1)).toMatch(/server[\\/]discovery[\\/]main\.ts$/);
  host.emit('SIGINT'); children.forEach(child => child.emit('close', 0, null)); expect(await launch.done).toBe(0);
  expect(host.listenerCount('SIGINT')).toBe(0); expect(host.listenerCount('SIGTERM')).toBe(0);
});
test('child failure shuts down its running sibling and propagates its exit code', async () => {
  const { children, launch } = fixture(); children[0].emit('close', 7, null);
  expect(children[1].send).toHaveBeenCalledWith({ type: 'discovery-dev-shutdown' }); expect(children[0].send).not.toHaveBeenCalled();
  children[1].emit('close', 0, null); expect(await launch.done).toBe(7);
});
test.each(['SIGINT', 'SIGTERM'])('shared %s shutdown requests both children once and awaits close', async signal => {
  const { children, host, launch } = fixture(); host.emit(signal); host.emit(signal);
  children.forEach(child => expect(child.send).toHaveBeenCalledTimes(1));
  children.forEach(child => child.emit('close', 0, null)); expect(await launch.done).toBe(0);
});
test('spawn errors terminate owned siblings and report failure', async () => {
  const { children, launch } = fixture(); children[0].emit('error', new Error('private environment'));
  children[0].emit('close', null, null); children[1].emit('close', 0, null); expect(await launch.done).toBe(1);
});
test('bounded shutdown kills only remaining owned child when cooperative close stalls', async () => {
  vi.useFakeTimers(); const { children, host, launch } = fixture(); host.emit('SIGTERM'); children[0].emit('close', 0, null);
  vi.advanceTimersByTime(50); expect(children[0].kill).not.toHaveBeenCalled(); expect(children[1].kill).toHaveBeenCalledWith('SIGKILL');
  children[1].emit('close', null, 'SIGKILL'); expect(await launch.done).toBe(0);
});

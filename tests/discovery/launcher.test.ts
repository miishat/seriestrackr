// @vitest-environment node
import { EventEmitter } from 'node:events';
import { spawn as nativeSpawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
test('malformed fake configuration exits with the real IPC preload and shuts down sibling', async () => {
  const root = mkdtempSync(join(tmpdir(), 'seriestrackr-launcher-config-test-'));
  writeFileSync(join(root, '.env.deepseek.local'), 'DEEPSEEK_MODEL="unterminated');
  const sibling = new Child();
  sibling.send.mockImplementation(() => { setImmediate(() => sibling.emit('close', 0, null)); return true; });
  let service!: ChildProcess; let errors = ''; let timer: ReturnType<typeof setTimeout>;
  const launched = launchDevelopment({ host: new EventEmitter(), shutdownMs: 50,
    spawn: (command, args, options) => {
      if (args.at(-1)!.endsWith('vite.js')) return sibling;
      service = nativeSpawn(command, args, { ...options, cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      service.stdout!.resume(); service.stderr!.on('data', chunk => { errors += chunk; });
      return service;
    } });
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('startup failure did not exit')), 2000); });
    expect(await Promise.race([launched.done, timeout])).toBe(1);
    expect(errors.trim()).toBe('Discovery configuration could not be loaded.');
    expect(sibling.send).toHaveBeenCalledOnce();
    expect(sibling.send).toHaveBeenCalledWith({ type: 'discovery-dev-shutdown' });
    expect(sibling.kill).not.toHaveBeenCalled();
    expect(service.connected).toBe(false);
  } finally {
    clearTimeout(timer!);
    if (service.exitCode === null && service.signalCode === null) service.kill('SIGKILL');
    await launched.done;
    rmSync(root, { recursive: true, force: true });
  }
});

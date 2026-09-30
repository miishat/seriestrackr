import { spawn as nativeSpawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const launcher = fileURLToPath(import.meta.url);
const root = resolve(dirname(launcher), '..');
const shutdownMessage = { type: 'discovery-dev-shutdown' };

// Preloaded into the two direct Node children. IPC requests invoke their native
// SIGTERM handlers even on Windows, where child.kill() cannot deliver a signal.
if (process.send && resolve(process.argv[1] ?? '') !== launcher) {
  let requested = false;
  const shutdown = () => { if (!requested) { requested = true; process.emit('SIGTERM'); } };
  process.on('message', message => { if (message?.type === shutdownMessage.type) shutdown(); });
  process.once('disconnect', shutdown);
}

/** @param {{ spawn?: (command: string, args: string[], options: import('node:child_process').SpawnOptions) => import('node:events').EventEmitter & { connected?: boolean, send: (message: object) => boolean, kill: (signal: NodeJS.Signals) => boolean }, host?: import('node:events').EventEmitter, shutdownMs?: number }} options */
export function launchDevelopment({ spawn = nativeSpawn, host = process, shutdownMs = 5000 } = {}) {
  const children = new Set(); let stopping = false; let exitCode = 0; let timer;
  let finish;
  const done = new Promise(resolveDone => { finish = resolveDone; });
  const cleanup = () => {
    clearTimeout(timer); host.off('SIGINT', signalShutdown); host.off('SIGTERM', signalShutdown);
    finish(exitCode);
  };
  const shutdown = (code = 0) => {
    if (stopping) return; stopping = true; exitCode = code;
    for (const child of children) {
      if (child.connected) {
        try { child.send(shutdownMessage); } catch { child.kill('SIGTERM'); }
      } else child.kill('SIGTERM');
    }
    if (!children.size) { cleanup(); return; }
    timer = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); }, shutdownMs);
  };
  const signalShutdown = () => shutdown();
  host.on('SIGINT', signalShutdown); host.on('SIGTERM', signalShutdown);
  try {
    const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
    // Loading tsx directly keeps the service in the owned Node child. Its CLI
    // otherwise introduces a wrapper and grandchild, complicating Windows exit.
    const commands = [ ['--import', pathToFileURL(launcher).href, vite],
      ['--import', pathToFileURL(launcher).href, '--import', pathToFileURL(require.resolve('tsx')).href, join(root, 'server', 'discovery', 'main.ts')] ];
    for (const args of commands) {
      const child = spawn(process.execPath, args, { cwd: root, shell: false, windowsHide: true, detached: false, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
      children.add(child);
      child.once('error', () => shutdown(1));
      child.once('close', (code, signal) => {
        children.delete(child);
        if (!stopping) shutdown(typeof code === 'number' && code !== 0 ? code : signal ? 1 : 0);
        else if (!children.size) cleanup();
      });
    }
  } catch { shutdown(1); }
  return { done, shutdown: signalShutdown };
}

if (process.argv[1] && resolve(process.argv[1]) === launcher) {
  const launched = launchDevelopment();
  launched.done.then(code => { process.exitCode = code; });
}

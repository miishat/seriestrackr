import { loadDiscoveryConfig } from './config';
import { createDiscoveryServer } from './server';

try {
  const server = createDiscoveryServer(loadDiscoveryConfig(process.cwd()));
  let stopping = false;
  const shutdown = () => {
    if (stopping) return; stopping = true;
    server.close(() => { if (process.connected) process.disconnect(); });
    server.closeAllConnections();
  };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  server.once('error', error => {
    console.error((error as NodeJS.ErrnoException).code === 'EADDRINUSE' ? 'Discovery port 3001 is already in use.' : 'Discovery service could not start.');
    process.exitCode = 1; shutdown();
  });
  server.listen(3001, '127.0.0.1', () => console.log('Discovery service: http://127.0.0.1:3001'));
} catch {
  console.error('Discovery configuration could not be loaded.'); process.exitCode = 1;
}

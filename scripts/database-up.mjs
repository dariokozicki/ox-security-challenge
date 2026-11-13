import { spawnSync } from 'node:child_process';

// The token only satisfies Compose interpolation; this command starts no API or worker.
const result = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'postgres'], {
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    TRACE_TOKEN: process.env.TRACE_TOKEN || 'local-database-start-placeholder-token',
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

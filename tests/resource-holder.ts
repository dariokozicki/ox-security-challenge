import { createScanWorkspace } from '../src/server/scan-resources.js';
import { runCommand } from '../src/server/process.js';
import { config } from '../src/server/config.js';

const workspace = await createScanWorkspace(process.argv[2]);
process.stdout.write(JSON.stringify(workspace) + '\n');
await runCommand('docker', [
  'run',
  '--init',
  '--rm',
  '--name',
  workspace.name,
  '--network=none',
  '--entrypoint',
  'timeout',
  config.semgrepImage,
  '-k',
  '1',
  process.argv[3],
  'sleep',
  '60',
]);

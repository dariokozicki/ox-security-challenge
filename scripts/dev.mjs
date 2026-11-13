import { spawn } from 'node:child_process';
const args = [
  ['--import', 'tsx', 'src/server/main.ts'],
  ['--import', 'tsx', 'src/server/worker-main.ts'],
  ['node_modules/vite/bin/vite.js'],
];
const children = args.map((a) =>
  spawn(process.execPath, a, { stdio: 'inherit', windowsHide: true }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1000).unref();
}
for (const c of children) c.on('exit', (code) => stop(code || 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

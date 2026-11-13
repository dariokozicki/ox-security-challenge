import { spawn } from 'node:child_process';

// This process survives a worker crash long enough to terminate its direct Codex child.
// Codex shell, application, MCP and sub-agent tools are disabled by the caller.
const request = JSON.parse(process.argv[2]);
const child = spawn(request.command, request.args, {
  cwd: process.cwd(),
  env: process.env,
  windowsHide: true,
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stopping = false;
let force;
const stop = () => {
  if (stopping) return;
  stopping = true;
  child.kill('SIGTERM');
  force = setTimeout(() => child.kill('SIGKILL'), 1000);
};
process.stdin.pipe(child.stdin);
// A dead worker also closes the output pipes. Do not crash before terminating Codex.
process.stdout.on('error', stop);
process.stderr.on('error', stop);
child.stdin.on('error', () => {});
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on('error', () => {
  stopping = true;
});
child.on('close', (code) => {
  clearTimeout(force);
  clearTimeout(deadline);
  process.exitCode = stopping ? 1 : (code ?? 1);
  process.stdin.unpipe(child.stdin);
  process.stdin.destroy();
  process.removeListener('disconnect', stop);
  if (process.connected) process.disconnect();
  // Natural exit lets the supervisor's output pipes drain before the parent resolves.
});
process.on('message', (message) => {
  if (message === 'abort') stop();
});
process.on('disconnect', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
const deadline = setTimeout(stop, request.timeoutMs);

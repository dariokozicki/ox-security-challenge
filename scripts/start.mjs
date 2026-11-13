import { spawn } from 'node:child_process';
const children = ['dist/server/server/main.js', 'dist/server/server/worker-main.js'].map((file) => {
  const env = { ...process.env };
  if (file.endsWith('/main.js')) {
    delete env.OPENAI_API_KEY;
    delete env.CHATGPT_API_KEY_OX_CHALLENGE;
  }
  return spawn(process.execPath, [file], { stdio: 'inherit', windowsHide: true, env });
});
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1000).unref();
}
for (const child of children) child.on('exit', (code) => stop(code || 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

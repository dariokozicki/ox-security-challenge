import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { localProcess } from '../src/server/agent-process.js';
import { agentEnvironment } from '../src/server/agent-environment.js';

const dead = (pid: number) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
};
async function pidFrom(file: string) {
  for (let i = 0; i < 100; i++) {
    try {
      return Number(await readFile(file, 'utf8'));
    } catch {
      await delay(20);
    }
  }
  throw new Error('Test child did not start');
}
const childScript = (file: string, flood = false) =>
  `require('fs').writeFileSync(${JSON.stringify(file)}, String(process.pid));` +
  (flood
    ? "setInterval(()=>process.stderr.write('x'.repeat(65536)),1)"
    : 'setInterval(()=>{},100)');

test('successful local inference drains its complete output before resolving', async () => {
  const result = await localProcess(
    process.execPath,
    ['-e', "process.stdout.write('x'.repeat(1500000)+'FINAL_SEARCH_EVENT')"],
    { cwd: process.cwd(), env: agentEnvironment(process.env) },
  );
  assert.equal(result, 'x'.repeat(1500000) + 'FINAL_SEARCH_EVENT');
});

test('local inference inherits login paths but no service credentials or API routing', () => {
  assert.deepEqual(
    agentEnvironment({
      PATH: 'bin',
      USERPROFILE: 'home',
      CODEX_HOME: 'codex',
      DATABASE_URL: 'secret',
      GITHUB_TOKEN: 'secret',
      TRACE_TOKEN: 'secret',
      OPENAI_API_KEY: 'secret',
      CODEX_API_KEY: 'secret',
      OPENAI_BASE_URL: 'https://unexpected.example',
    }),
    { PATH: 'bin', USERPROFILE: 'home', CODEX_HOME: 'codex' },
  );
});

test('local inference waits for exit on timeout, cancellation and excessive stderr', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trace-process-test-'));
  try {
    for (const mode of ['timeout', 'cancel', 'output']) {
      const file = join(directory, `${mode}.pid`);
      const controller = new AbortController();
      const pending = localProcess(process.execPath, ['-e', childScript(file, mode === 'output')], {
        cwd: directory,
        env: agentEnvironment(process.env),
        signal: controller.signal,
        timeoutMs: mode === 'timeout' ? 1200 : 10000,
        captureStderr: true,
      });
      const rejected = assert.rejects(pending, /Local Codex|output budget/);
      const pid = await pidFrom(file);
      if (mode === 'cancel') controller.abort();
      await rejected;
      assert.equal(dead(pid), true, `${mode} must terminate inference before rejecting`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('watchdog terminates inference after its worker IPC disappears', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trace-orphan-test-'));
  const file = join(directory, 'child.pid');
  const child = spawn(
    process.execPath,
    [
      resolve('scripts/agent-watchdog.mjs'),
      JSON.stringify({
        command: process.execPath,
        args: ['-e', childScript(file)],
        timeoutMs: 10000,
      }),
    ],
    { cwd: directory, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true },
  );
  const closed = new Promise<void>((done, reject) => {
    child.once('exit', () => done());
    child.once('error', reject);
  });
  try {
    const pid = await pidFrom(file);
    child.disconnect();
    await closed;
    assert.equal(dead(pid), true);
  } finally {
    if (child.connected) child.disconnect();
    await closed;
    await rm(directory, { recursive: true, force: true });
  }
});

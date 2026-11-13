import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { runCommand } from '../src/server/process.js';
import { sweepScanResources, removeScanWorkspace } from '../src/server/scan-resources.js';
import type { ScanWorkspace } from '../src/server/types.js';

for (const seconds of ['60', '3']) {
  test(`worker death: ${seconds === '60' ? 'recovery cleans active container' : 'container timeout survives parent'}`, async () => {
    const id = randomUUID();
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'tests/resource-holder.ts', id, seconds],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] },
    );
    const workspace = await new Promise<ScanWorkspace>((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error('Resource registration timed out')), 10000);
      child.stdout.on('data', (data) => {
        text += String(data);
        if (text.includes('\n')) {
          clearTimeout(timer);
          resolve(JSON.parse(text.split('\n')[0]));
        }
      });
      child.on('error', reject);
    });
    try {
      let started = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const inspect = await runCommand('docker', [
          'inspect',
          '-f',
          '{{.State.Running}}',
          workspace.name,
        ]);
        if (inspect.stdout.trim() === 'true') {
          started = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(started, 'Container never started');
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
      if (seconds === '60') await sweepScanResources(id);
      else {
        await runCommand('docker', ['wait', workspace.name], AbortSignal.timeout(10000));
        await sweepScanResources(id);
      }
      assert.notEqual((await runCommand('docker', ['inspect', workspace.name])).code, 0);
      await assert.rejects(access(workspace.directory));
    } finally {
      if (child.exitCode === null) child.kill();
      await removeScanWorkspace(workspace);
    }
  });
}

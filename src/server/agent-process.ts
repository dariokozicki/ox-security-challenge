import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { AppError } from './config.js';
import type { LocalProcessOptions } from './agent-types.js';

export function localProcess(
  command: string,
  args: string[],
  options: LocalProcessOptions,
): Promise<string> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      [
        resolve('scripts/agent-watchdog.mjs'),
        JSON.stringify({ command, args, timeoutMs: options.timeoutMs || 150000 }),
      ],
      {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      },
    );
    let output = '';
    let bytes = 0;
    let failure: Error | undefined;
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      // Keep the watchdog alive until it confirms Codex exited. Disconnect on worker death
      // also reaches the watchdog, so a hard-killed worker cannot orphan the inference.
      if (child.connected) child.send('abort', () => {});
    };
    const abort = () => stop(new AppError('local_agent', 'Local Codex was interrupted.', 503));
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    child.on('error', () => {
      options.signal?.removeEventListener('abort', abort);
      reject(new AppError('local_agent', 'Local Codex supervisor could not start.', 503));
    });
    child.stdin!.on('error', () => {});
    const collect = (data: Buffer, retain: boolean) => {
      if (failure) return;
      bytes += data.length;
      if (bytes > 2_000_000) {
        stop(new AppError('agent_output', 'Local agent exceeded its output budget.', 422));
        return;
      }
      if (retain) output += data.toString('utf8');
    };
    child.stdout!.on('data', (data: Buffer) => collect(data, true));
    child.stderr!.on('data', (data: Buffer) => collect(data, !!options.captureStderr));
    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(
          new AppError(
            'local_agent',
            'Local Codex failed. Check ChatGPT login, plan allowance, CLI version and model access. No API fallback was attempted.',
            503,
          ),
        );
      else resolveResult(output);
    });
    child.stdin!.end(options.input || '');
  });
}

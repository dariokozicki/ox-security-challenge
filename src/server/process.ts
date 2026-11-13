import { spawn } from 'node:child_process';
import { AppError } from './config.js';
import type { CommandResult } from './types.js';
export function runCommand(
  command: string,
  args: string[],
  signal?: AbortSignal,
  maxBytes = 5_000_000,
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    });
    let stdout = '',
      stderr = '',
      bytes = 0;
    child.on('error', reject);
    const collect = (part: 'stdout' | 'stderr', data: Buffer) => {
      bytes += data.length;
      if (bytes > maxBytes) {
        child.kill();
        reject(new AppError('output_limit', 'Scanner output exceeded its size limit.', 422));
        return;
      }
      if (part === 'stdout') stdout += data.toString();
      else stderr += data.toString();
    };
    child.stdout.on('data', (d) => collect('stdout', d));
    child.stderr.on('data', (d) => collect('stderr', d));
    child.on('close', (code) => resolveResult({ stdout, stderr, code }));
  });
}

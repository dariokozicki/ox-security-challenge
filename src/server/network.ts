import { AppError } from './config.js';
import type { Fetcher } from './types.js';
export async function boundedFetch(
  url: string,
  init: RequestInit = {},
  limit = 2_000_000,
  fetcher: Fetcher = fetch,
  timeoutMs = 15000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([controller.signal, init.signal])
    : controller.signal;
  try {
    const response = await fetcher(url, { ...init, signal, redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(
        'upstream',
        `Upstream ${new URL(url).hostname} returned HTTP ${response.status}.`,
        502,
        response.status === 429 || response.status >= 500,
      );
    }
    if (Number(response.headers.get('content-length') || 0) > limit) {
      await response.body?.cancel();
      throw new AppError('size_limit', 'Upstream response exceeded the size limit.', 422);
    }
    if (!response.body) return '';
    const reader = response.body.getReader();
    let total = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > limit)
          throw new AppError('size_limit', 'Upstream response exceeded the size limit.', 422);
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (signal.aborted)
      throw new AppError(
        'timeout',
        'Provider timed out; no clean result can be inferred.',
        504,
        true,
      );
    throw new AppError('network', 'Provider could not be reached. Check connectivity.', 502, true);
  } finally {
    clearTimeout(timer);
  }
}

import { AppError } from './config.js';
import { boundedFetch } from './network.js';
import type { Fetcher } from './types.js';

export async function acquireFile(
  url: string,
  limit: number,
  fetcher: Fetcher,
  signal?: AbortSignal,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await boundedFetch(url, { signal }, limit, fetcher);
    } catch (error) {
      if (signal?.aborted || !(error instanceof AppError) || !error.retryable || attempt === 2)
        throw error;
    }
  }
  throw new Error('Unreachable file-fetch state');
}

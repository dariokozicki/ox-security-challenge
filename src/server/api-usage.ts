import { AppError, config } from './config.js';
import type { ApiLedger, ApiUsage } from './api-usage-types.js';

export const apiModel = 'gpt-6-luna';
export function apiRequestLimit() {
  const value = Number(process.env.TRACE_API_MAX_REQUESTS || 12);
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000)
    throw new AppError('ai_config', 'TRACE_API_MAX_REQUESTS must be an integer from 1 to 1000.');
  return value;
}
export function exhausted() {
  return new AppError(
    'ai_budget',
    'API request allowance exhausted. Review usage before explicitly increasing TRACE_API_MAX_REQUESTS.',
    429,
  );
}
export function estimateUsage(
  inputTokens: number,
  outputTokens: number,
  searchCalls: number,
): ApiUsage {
  // Standard Luna prices checked 2026-11-11. Ignore cache discounts conservatively.
  const long = inputTokens > 272000;
  return {
    inputTokens,
    outputTokens,
    searchCalls,
    estimatedMicrousd: Math.ceil(
      inputTokens * (long ? 0.2 : 0.1) + outputTokens * (long ? 0.75 : 0.5) + searchCalls * 10000,
    ),
  };
}
export async function openApiLedger(): Promise<ApiLedger> {
  if (!config.databaseUrl)
    throw new AppError('ai_config', 'PostgreSQL is required for API usage accounting.', 503);
  const { postgresApiLedger } = await import('./db/api-usage.js');
  return postgresApiLedger(config.databaseUrl);
}

import { apiRequestLimit, openApiLedger } from './api-usage.js';
const ledger = await openApiLedger();
try {
  const entries = await ledger.entries();
  console.log(
    JSON.stringify(
      {
        requestsReserved: entries.length,
        requestLimit: apiRequestLimit(),
        requestsRemaining: Math.max(0, apiRequestLimit() - entries.length),
        unknownUsageRequests: entries.filter((entry) => !entry.usage).length,
        estimatedKnownUsd:
          entries.reduce((sum, entry) => sum + (entry.usage?.estimatedMicrousd || 0), 0) / 1e6,
        note: 'Estimate, not a billing statement. Failed or interrupted calls retain their request reservation.',
      },
      null,
      2,
    ),
  );
} finally {
  await ledger.close();
}

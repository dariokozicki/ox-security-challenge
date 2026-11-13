import { readFileSync } from 'node:fs';
try {
  const timestamp = Number(
    readFileSync(process.env.TRACE_WORKER_HEALTH_FILE || '/tmp/trace-worker-health', 'utf8'),
  );
  process.exit(Number.isFinite(timestamp) && Date.now() - timestamp < 15000 ? 0 : 1);
} catch {
  process.exit(1);
}

import { openStore } from './open-store.js';
import { workerLoop } from './worker.js';
const store = await openStore();
const controller = new AbortController();
process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());
console.log('Trace worker ready. Source files are analyzed, never executed.');
try {
  await workerLoop(store, controller.signal);
} finally {
  await store.close();
}

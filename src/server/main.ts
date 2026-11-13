import { buildApi } from './api.js';
import { openStore } from './open-store.js';
import { config } from './config.js';
if (!['127.0.0.1', 'localhost', '::1'].includes(config.host) && config.token.length < 32)
  throw new Error('Remote binding requires TRACE_TOKEN with at least 32 characters.');
const store = await openStore();
const app = await buildApi(store, { logger: true });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => store.close());
  });
await app.listen({ host: config.host, port: config.port });

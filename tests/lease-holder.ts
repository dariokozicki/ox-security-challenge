import { openStore } from '../src/server/open-store.js';
import { acquire } from '../src/server/acquire.js';
import { scanDependencies } from '../src/server/dependency-scanner.js';

// A disposable worker killed by the process fault drill after a durable stage commit.
const store = await openStore();
const claim = await store.claim();
if (!claim) throw new Error('No job available');
const snapshot = await acquire(claim.scan.repository, 'demo');
await store.checkpoint(claim.scan.id, claim.fence, snapshot);
await store.stage(claim.scan.id, claim.fence, 'dependencies', await scanDependencies(snapshot));
process.stdout.write('CHECKPOINT_READY\n');
setInterval(() => {}, 1000);

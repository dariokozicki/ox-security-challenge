import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { sourceFile, safeSourcePath, canonicalRepository } from '../src/server/acquire.ts';
import { boundedFetch } from '../src/server/network.ts';
import { investigateSource } from '../src/server/ai-source.ts';
import { openApiLedger } from '../src/server/api-usage.ts';
import { intakeLimit } from '../src/server/file-selection.ts';

// This harness only reads repository bytes. Never import or execute fetched files.
const manifest = JSON.parse(await readFile('fixtures/benchmarks/projects.json', 'utf8'));
const [command = 'list', id] = process.argv.slice(2);
if (command === 'list') {
  console.log(
    manifest.map((item) => `${item.id}: ${item.split}, ${item.files.length} files`).join('\n'),
  );
} else {
  if (!['fetch', 'run', 'report'].includes(command))
    throw new Error('Use list, fetch, run or report.');
  const item = manifest.find((entry) => entry.id === id);
  if (!item || !/^[a-z0-9-]+$/.test(item.id)) throw new Error('Unknown benchmark case.');
  item.repository = canonicalRepository(item.repository);
  const directory = resolve('.trace/benchmarks', item.id);
  await mkdir(directory, { recursive: true });
  const snapshotPath = resolve(directory, 'snapshot.json');
  const resultPath = resolve(directory, 'result.json');
  if (command === 'fetch') {
    canonicalRepository(item.repository);
    if (!/^[a-f0-9]{40}$/.test(item.revision)) throw new Error('A pinned commit is required.');
    const files = [];
    let bytes = 0;
    for (const path of item.files) {
      if (!safeSourcePath(path)) throw new Error('Unsafe benchmark source path.');
      const url =
        `${item.repository.replace('github.com', 'raw.githubusercontent.com')}/${item.revision}/` +
        path.split('/').map(encodeURIComponent).join('/');
      const content = await boundedFetch(url, {}, intakeLimit(path));
      bytes += Buffer.byteLength(content);
      if (bytes > 2_000_000) throw new Error('Benchmark exceeds 2 MB.');
      files.push(sourceFile(path, content));
    }
    await writeFile(
      snapshotPath,
      JSON.stringify(
        {
          repository: item.repository,
          revision: item.revision,
          acquiredAt: new Date().toISOString(),
          fixture: false,
          files,
          warnings: [],
        },
        null,
        2,
      ),
    );
    console.log(`Cached ${files.length} pinned source files. No code executed.`);
  } else if (command === 'run') {
    if (item.split === 'holdout' && !process.argv.includes('--holdout'))
      throw new Error('Use --holdout for an intentional holdout evaluation; freeze changes first.');
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
    if (
      snapshot.revision !== item.revision ||
      snapshot.repository !== item.repository ||
      snapshot.files.length !== item.files.length ||
      new Set(snapshot.files.map((file) => file.path)).size !== item.files.length ||
      snapshot.fixture ||
      !snapshot.files.every(
        (file) =>
          item.files.includes(file.path) &&
          sourceFile(file.path, file.content).sha256 === file.sha256,
      )
    )
      throw new Error('Cached snapshot differs from the pinned manifest. Fetch it again.');
    const ledger = await openApiLedger();
    try {
      const before = await ledger.entries();
      // Expectations and README labels are deliberately kept out of the model input.
      const result = await investigateSource(snapshot);
      const after = await ledger.entries();
      const knownCost = (entries) =>
        entries.reduce((sum, entry) => sum + (entry.usage?.estimatedMicrousd || 0), 0);
      await writeFile(
        resultPath,
        JSON.stringify(
          {
            id,
            revision: item.revision,
            checkedAt: new Date().toISOString(),
            requests: after.length - before.length,
            estimatedUsd: (knownCost(after) - knownCost(before)) / 1e6,
            unknownUsageAfter: after.filter((entry) => !entry.usage).length,
            accounting:
              'Request/cost ledger delta includes concurrent activity; unknownUsageAfter is all unresolved calls.',
            result,
          },
          null,
          2,
        ),
      );
      console.log(`${id}: ${result.findings.length} cited findings; inspect with report.`);
    } finally {
      await ledger.close();
    }
  } else {
    const run = JSON.parse(await readFile(resultPath, 'utf8'));
    console.log(JSON.stringify({ ...run, expectationsForHumanReview: item.expectations }, null, 2));
  }
}

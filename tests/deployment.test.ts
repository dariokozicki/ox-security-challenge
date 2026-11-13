import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from '../src/server/db/connection.js';

test('database URL TLS options cannot override certificate verification configuration', () => {
  for (const option of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
    assert.throws(() => connect(`postgres://localhost/test?${option}=true`), /DATABASE_SSL/);
});

test('ECS renderer forwards CA configuration to API, worker and migrations without deploying', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trace-ecs-test-'));
  try {
    execFileSync(process.execPath, ['scripts/render-ecs.mjs'], {
      env: {
        ...process.env,
        AWS_REGION: 'us-east-1',
        TRACE_IMAGE: 'example/image:test',
        TRACE_EXECUTION_ROLE_ARN: 'arn:aws:iam::000000000000:role/example',
        TRACE_DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:000000000000:secret:db',
        TRACE_TOKEN_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:000000000000:secret:token',
        TRACE_PUBLIC_ORIGIN: 'https://trace.example',
        TRACE_AI_PROVIDER: 'disabled',
        DATABASE_CA_FILE: '/app/certs/rds.pem',
        TRACE_ECS_OUTPUT: directory,
      },
      windowsHide: true,
    });
    for (const role of ['api', 'worker', 'migrate']) {
      const definition = JSON.parse(await readFile(join(directory, `${role}.task.json`), 'utf8'));
      assert.ok(
        definition.containerDefinitions[0].environment.some(
          (item: { name: string; value: string }) =>
            item.name === 'DATABASE_CA_FILE' && item.value === '/app/certs/rds.pem',
        ),
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

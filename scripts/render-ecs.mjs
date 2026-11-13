import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const required = (name) => {
  if (!process.env[name])
    throw new Error(`${name} is required; use secret ARNs, never secret values.`);
  return process.env[name];
};
const region = required('AWS_REGION');
const image = required('TRACE_IMAGE');
const executionRoleArn = required('TRACE_EXECUTION_ROLE_ARN');
const databaseSecret = required('TRACE_DATABASE_SECRET_ARN');
const tokenSecret = required('TRACE_TOKEN_SECRET_ARN');
const origin = required('TRACE_PUBLIC_ORIGIN');
const provider = process.env.TRACE_AI_PROVIDER || 'disabled';
if (!['disabled', 'openai'].includes(provider))
  throw new Error(
    'ECS supports disabled demo mode or explicit openai mode. Local ChatGPT login stays local.',
  );
const directory = resolve(process.env.TRACE_ECS_OUTPUT || 'output/ecs');
mkdirSync(directory, { recursive: true });
for (const role of ['api', 'worker', 'migrate']) {
  const worker = role === 'worker';
  const filename = role === 'migrate' ? 'db/migrate-main' : worker ? 'worker-main' : 'main';
  const environment = [
    { name: 'NODE_ENV', value: 'production' },
    { name: 'DATABASE_SSL', value: 'true' },
    { name: 'TRACE_AI_PROVIDER', value: provider },
    { name: 'TRACE_PUBLIC_ORIGIN', value: origin },
    { name: 'TRACE_WORKER_CONCURRENCY', value: '2' },
    { name: 'TRACE_WORKER_HEALTH_FILE', value: '/tmp/trace-worker-health' },
  ];
  const secrets = [{ name: 'DATABASE_URL', valueFrom: databaseSecret }];
  if (process.env.DATABASE_CA_FILE)
    environment.push({ name: 'DATABASE_CA_FILE', value: process.env.DATABASE_CA_FILE });
  if (role === 'api') secrets.push({ name: 'TRACE_TOKEN', valueFrom: tokenSecret });
  if (worker && provider === 'openai')
    secrets.push({
      name: 'CHATGPT_API_KEY_OX_CHALLENGE',
      valueFrom: required('TRACE_OPENAI_SECRET_ARN'),
    });
  const definition = {
    family: `trace-${role}`,
    networkMode: 'awsvpc',
    requiresCompatibilities: ['FARGATE'],
    cpu: '512',
    memory: '1024',
    executionRoleArn,
    runtimePlatform: { cpuArchitecture: 'X86_64', operatingSystemFamily: 'LINUX' },
    containerDefinitions: [
      {
        name: `trace-${role}`,
        image,
        essential: true,
        command: ['node', `dist/server/server/${filename}.js`],
        user: '1000',
        linuxParameters: { initProcessEnabled: true, capabilities: { drop: ['ALL'] } },
        environment,
        secrets,
        stopTimeout: 120,
        ...(role === 'api' ? { portMappings: [{ containerPort: 4310, protocol: 'tcp' }] } : {}),
        ...(role !== 'migrate'
          ? {
              healthCheck: {
                command: worker
                  ? ['CMD', 'node', 'scripts/worker-health.mjs']
                  : [
                      'CMD',
                      'node',
                      '-e',
                      "fetch('http://127.0.0.1:4310/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
                    ],
                interval: 15,
                timeout: 5,
                retries: 3,
                startPeriod: 30,
              },
            }
          : {}),
        logConfiguration: {
          logDriver: 'awslogs',
          options: {
            'awslogs-group': '/ecs/trace',
            'awslogs-region': region,
            'awslogs-stream-prefix': role,
          },
        },
      },
    ],
  };
  writeFileSync(
    resolve(directory, `${role}.task.json`),
    JSON.stringify(definition, null, 2) + '\n',
  );
}
console.log(
  `Wrote API, worker and migration task definitions to ${directory}. Nothing was deployed. Mount shared snapshot storage and set TRACE_SNAPSHOT_DIR on all roles before deployment; S3 is not implemented.`,
);

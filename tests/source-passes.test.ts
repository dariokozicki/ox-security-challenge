import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investigateSource } from '../src/server/ai-source.js';
import { sourceFile } from '../src/server/acquire.js';
import { AppError } from '../src/server/config.js';
import { createOpenAiAgent } from '../src/server/agent-openai.js';
import { snapshot } from './helpers.js';

const observation = {
  title: 'Request input reaches shell',
  severity: 'high',
  summary: 'Command injection.',
  rationale: 'Request value reaches exec.',
  evidence: { path: 'app.js', line: 1, endLine: 1, quote: 'exec(req.body.command);' },
  path: [],
  prerequisites: [],
  limitations: [],
  remediation: 'Use an argument array.',
};
const response = (findings: unknown[]) => ({
  data: { findings, limitations: [], rejections: [] },
  provider: 'controlled runner',
  searched: false,
  referenceProvenance: 'provider_retrieved' as const,
  urls: [],
});
const input = () => ({ ...snapshot(), files: [sourceFile('app.js', 'exec(req.body.command);')] });

test('overlapping duplicate ranges cannot hide a conflicting retain and reject decision', async () => {
  const lines = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  const range = (line: number, endLine: number) => ({
    ...observation,
    evidence: { path: 'app.js', line, endLine, quote: lines.slice(line - 1, endLine).join('\n') },
  });
  let calls = 0;
  const result = await investigateSource(
    { ...input(), files: [sourceFile('app.js', lines.join('\n'))] },
    undefined,
    async (request) => {
      if (++calls === 1) return response([range(5, 7)]);
      const payload = request.input as { priorCandidates: { id: string }[] };
      return {
        ...response([]),
        data: {
          findings: [range(1, 3), range(3, 5)],
          limitations: [],
          rejections: [
            {
              findingId: payload.priorCandidates[0].id,
              reason: 'Contradictory reviewer decision',
              evidence: range(5, 7).evidence,
            },
          ],
        },
      };
    },
  );
  assert.ok(result.findings.some((item) => item.evidence.line === 5));
  assert.equal(result.sourceRejections?.length, 0);
  assert.match(result.detail, /both retained and rejected/);
});

test('two source passes retain additional findings and deduplicate repeated identities', async () => {
  let calls = 0;
  const result = await investigateSource(input(), undefined, async (request) => {
    calls++;
    if (calls === 2) {
      assert.match(request.instructions, /bounded second review/);
      assert.match(JSON.stringify(request.input), /priorCandidates/);
      return response([observation, { ...observation, title: 'Separate issue for test' }]);
    }
    return response([observation]);
  });
  assert.equal(calls, 2);
  assert.equal(result.findings.length, 2);
  assert.match(result.detail, /2\/2 passes/);
});

test('follow-up failure or budget exhaustion preserves the first verified finding', async () => {
  let calls = 0;
  const result = await investigateSource(input(), undefined, async () => {
    if (++calls === 2) throw new AppError('ai_budget', 'API request allowance exhausted.', 429);
    return response([observation]);
  });
  assert.equal(calls, 2);
  assert.equal(result.findings.length, 1);
  assert.equal(result.status, 'partial');
  assert.match(result.detail, /allowance exhausted/);
});

test('candidate reconsideration omissions are disclosed when follow-up input is full', async () => {
  const source = input();
  source.files.push(
    ...Array.from({ length: 80 }, (_, i) => sourceFile(`context${i}.js`, '// ' + '🌍'.repeat(200))),
  );
  let calls = 0;
  const result = await investigateSource(source, undefined, async (request) => {
    if (++calls === 1)
      return response(
        Array.from({ length: 12 }, (_, i) => ({
          ...observation,
          title: `${i} issue`,
          summary: '🌍'.repeat(500),
          rationale: '🌍'.repeat(500),
        })),
      );
    const payload = request.input as { priorCandidates: unknown[] };
    assert.ok(payload.priorCandidates.length < 12);
    return response([]);
  });
  assert.equal(result.findings.length, 12);
  assert.match(result.detail, /prior candidates omitted from reconsideration/);
  assert.equal(result.status, 'partial');
});

test('only verified corrected locations steer follow-up and a later verified path replaces a broken one', async () => {
  let calls = 0;
  const goodStep = { label: 'sink', detail: 'Shell call', evidence: observation.evidence };
  const result = await investigateSource(input(), undefined, async (request) => {
    if (++calls === 1)
      return response([
        {
          ...observation,
          evidence: { ...observation.evidence, line: 99, endLine: 99 },
          path: [{ ...goodStep, evidence: { ...observation.evidence, path: 'missing.js' } }],
        },
        {
          ...observation,
          title: 'Invented finding',
          evidence: { ...observation.evidence, quote: 'imaginary' },
        },
      ]);
    const payload = request.input as { priorCandidates: { title: string; line: number }[] };
    assert.deepEqual(
      payload.priorCandidates.map((item) => [item.title, item.line]),
      [[observation.title, 1]],
    );
    assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(payload))) <= 90_000);
    return response([{ ...observation, path: [goodStep] }]);
  });
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path.length, 1);
  assert.doesNotMatch(result.detail, /Path evidence.*needs review/);
  assert.ok(!result.findings[0].limitations.some((item) => item.includes('Path citations')));
});

test('both source passes fit the API envelope with escaped Unicode and long candidate titles', async () => {
  const previous = process.env.CHATGPT_API_KEY_OX_CHALLENGE;
  process.env.CHATGPT_API_KEY_OX_CHALLENGE = 'synthetic-test-credential';
  let calls = 0;
  try {
    const runner = createOpenAiAgent(
      async (_url, options) => {
        calls++;
        const body = String(options?.body);
        assert.ok(Buffer.byteLength(body) <= 120_000);
        assert.equal(JSON.parse(body).max_output_tokens, 12000);
        return new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      limitations: [],
                      rejections: [],
                      findings: Array.from({ length: 12 }, (_, index) => ({
                        ...observation,
                        title: `${index} ${'🌍'.repeat(400)}`,
                      })),
                    }),
                  },
                ],
              },
            ],
          }),
        );
      },
      async () => ({
        reserve: async () => 'reservation',
        record: async () => {},
        entries: async () => [],
        close: async () => {},
      }),
    );
    const source = input();
    source.files.push(
      ...Array.from({ length: 30 }, (_, index) =>
        sourceFile(`file${index}.js`, '// ' + '"🌍\\'.repeat(250)),
      ),
    );
    const result = await investigateSource(source, undefined, runner);
    assert.equal(calls, 2);
    assert.equal(result.findings.length, 12);
  } finally {
    if (previous === undefined) delete process.env.CHATGPT_API_KEY_OX_CHALLENGE;
    else process.env.CHATGPT_API_KEY_OX_CHALLENGE = previous;
  }
});

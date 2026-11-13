import type { AnalyzerResult, Snapshot } from '../shared/types.js';
import type { AgentRunner } from './agent-types.js';
import type { SourceCollection } from './investigation-types.js';
import { runAgent } from './agent.js';
import { SourceReview, SourceFollowup, schemaFor } from './investigation-schemas.js';
import { sourceInstructions, sourceFollowupInstructions } from './investigation-prompts.js';
import { collectSourceFindings } from './source-results.js';
import { sourceInput } from './source-input.js';
import { demoSource } from './demo-investigation.js';
import { publicError } from './config.js';
import { sourceGuidance } from './source-guidance.js';
import { adjudicateSource } from './source-adjudication.js';
import { sourceTargets } from './source-targets.js';
import { sourceFinding } from './investigation-evidence.js';
import { routeContexts, applyRouteContext } from './route-context.js';
import { addTemplateFindings, templateFindings } from './template-flow.js';
import type { AgentResponse } from './agent-types.js';

export async function investigateSource(
  snapshot: Snapshot,
  signal?: AbortSignal,
  runner: AgentRunner = runAgent,
): Promise<AnalyzerResult> {
  if (snapshot.fixture) return demoSource(snapshot);
  const start = Date.now();
  const { input, files, candidateCount } = sourceInput(snapshot);
  if (!files.length)
    return {
      status: 'skipped',
      findings: [],
      durationMs: 0,
      version: 'AI source investigation v1',
      detail: 'No source file fits the 80 KB review input budget.',
    };
  const request = {
    instructions: sourceInstructions + sourceGuidance,
    research: false,
    schema: schemaFor(SourceReview),
    input,
  };
  let response: AgentResponse;
  let review: ReturnType<typeof SourceReview.parse>;
  const reviewedSnapshot = { ...snapshot, files };
  try {
    response = await runner(request, signal);
    review = SourceReview.parse(response.data);
  } catch (error) {
    const findings = templateFindings(reviewedSnapshot);
    return {
      status: findings.length ? 'partial' : 'failed',
      findings,
      durationMs: Date.now() - start,
      version: 'Trace direct template flow v1',
      detail: `AI source investigation did not finish. ${publicError(error)} Direct template checks retained ${findings.length} findings.`,
    };
  }
  const collected: SourceCollection = {
    findings: [],
    warnings: [...review.limitations],
    pathWarnings: new Map(),
  };
  collectSourceFindings(review.findings, reviewedSnapshot, response.provider, collected);
  const followupInput = {
    ...input,
    reviewTargets: sourceTargets(files),
    priorCandidates: collected.findings.map((item) => ({
      id: item.id,
      title: item.title.slice(0, 160),
      summary: item.summary.slice(0, 500),
      rationale: item.rationale.slice(0, 500),
      path: item.evidence.path,
      line: item.evidence.line,
    })),
  };
  const targetCount = followupInput.reviewTargets.length;
  const candidateTotal = followupInput.priorCandidates.length;
  while (
    Buffer.byteLength(JSON.stringify(JSON.stringify(followupInput))) > 90_000 &&
    followupInput.reviewTargets.length
  )
    followupInput.reviewTargets.pop();
  while (
    Buffer.byteLength(JSON.stringify(JSON.stringify(followupInput))) > 90_000 &&
    followupInput.priorCandidates.length
  )
    followupInput.priorCandidates.pop();
  if (followupInput.priorCandidates.length < candidateTotal)
    collected.warnings.push(
      `Follow-up budget: ${candidateTotal - followupInput.priorCandidates.length} prior candidates omitted from reconsideration.`,
    );
  if (followupInput.reviewTargets.length < targetCount)
    collected.warnings.push(
      `Follow-up budget: ${targetCount - followupInput.reviewTargets.length} boundary inspection hints omitted.`,
    );
  let passes = 1;
  let sourceRejections: AnalyzerResult['sourceRejections'] = [];
  try {
    const followup = await runner(
      {
        ...request,
        instructions: sourceInstructions + sourceGuidance + sourceFollowupInstructions,
        schema: schemaFor(SourceFollowup),
        input: followupInput,
      },
      signal,
    );
    const additional = SourceFollowup.parse(followup.data);
    // Preserve every verified range for conflict checks: overlap is not transitive.
    const verifiedAdditions = additional.findings.flatMap((item) => {
      try {
        return [sourceFinding({ ...item, path: [] }, reviewedSnapshot, followup.provider)];
      } catch {
        return [];
      } // Collection below records rejected citations.
    });
    sourceRejections = adjudicateSource(
      additional.rejections,
      new Set(followupInput.priorCandidates.map((item) => item.id)),
      reviewedSnapshot,
      collected,
      verifiedAdditions,
    );
    collectSourceFindings(additional.findings, reviewedSnapshot, followup.provider, collected);
    collected.warnings.push(...additional.limitations);
    passes++;
  } catch (error) {
    collected.warnings.push('Follow-up source review did not finish. ' + publicError(error));
  }
  const { findings } = collected;
  addTemplateFindings(findings, reviewedSnapshot);
  const routes = routeContexts(reviewedSnapshot);
  for (const finding of findings) applyRouteContext(finding, routes);
  const warnings = [...collected.warnings, ...collected.pathWarnings.values()];
  if (files.length !== candidateCount)
    warnings.push(
      `Only ${files.length}/${candidateCount} acquired source files fit the AI input budget.`,
    );
  return {
    status: warnings.length ? 'partial' : 'complete',
    findings,
    sourceRejections,
    durationMs: Date.now() - start,
    version: response.provider,
    checkedAt: new Date().toISOString(),
    detail: `${files.length} text files reviewed in ${passes}/2 passes; ${findings.length} hypotheses with exact source citations. ${[...new Set(warnings)].join(' ')}`,
  };
}

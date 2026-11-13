import type { AnalyzerResult, Snapshot } from '../shared/types.js';
import type { AgentRunner } from './agent-types.js';
import { runAgent } from './agent.js';
import { inventoryFrom } from './inventory.js';
import { ResearchReview, schemaFor } from './investigation-schemas.js';
import { researchInstructions } from './investigation-prompts.js';
import { researchFinding, publicReference } from './investigation-evidence.js';
import { AppError } from './config.js';
import { demoResearch } from './demo-investigation.js';

export async function researchThreats(
  snapshot: Snapshot,
  signal?: AbortSignal,
  runner: AgentRunner = runAgent,
): Promise<AnalyzerResult> {
  if (snapshot.fixture) return demoResearch(snapshot);
  const start = Date.now();
  const inventory = inventoryFrom(snapshot);
  const components = [...inventory.components]
    .sort((a, b) => Number(b.kind === 'runtime') - Number(a.kind === 'runtime'))
    .slice(0, 20);
  const checkedAt = new Date().toISOString();
  if (!components.length)
    return {
      status: 'skipped',
      findings: [],
      durationMs: 0,
      version: 'Emerging threat research v1',
      checkedAt,
      detail:
        'No supported components were identified for targeted research. Runtime exposure remains unknown.',
    };
  const response = await runner(
    {
      instructions: researchInstructions,
      research: true,
      schema: schemaFor(ResearchReview),
      input: {
        checkedAt,
        components: components.map(({ evidence: _evidence, ...component }) => component),
        limitations: inventory.warnings,
      },
    },
    signal,
  );
  if (!response.searched)
    throw new AppError(
      'search_missing',
      'The research provider did not record a web search; no current-threat conclusion is accepted.',
      502,
    );
  const review = ResearchReview.parse(response.data);
  const findings: AnalyzerResult['findings'] = [];
  const assessments: NonNullable<AnalyzerResult['assessments']> = [];
  const warnings = [...review.limitations];
  if (response.referenceProvenance === 'model_reported')
    warnings.push(
      'Local Codex source links are model-reported; page contents and claim support need independent review.',
    );
  if (inventory.components.length > components.length)
    warnings.push('Research was limited to 20 inventory entries, with runtimes first.');
  for (const report of review.reports) {
    const component = components.find((c) => c.id === report.componentId);
    if (
      !component ||
      !report.sources.every((s) => publicReference(s.url)) ||
      (response.referenceProvenance === 'provider_retrieved' &&
        !report.sources.every((s) => response.urls.includes(s.url)))
    ) {
      warnings.push(
        'A report was rejected because its component or source references could not be validated.',
      );
      continue;
    }
    if (
      report.publishedAt &&
      (Number.isNaN(Date.parse(report.publishedAt)) ||
        Date.parse(report.publishedAt) > Date.parse(checkedAt))
    ) {
      warnings.push('A report supplied an invalid publication date; its date is unknown.');
      report.publishedAt = null;
    }
    if (report.applicability === 'not_affected') {
      if (component.precision === 'exact') {
        assessments.push({
          title: report.title,
          reason: report.rationale,
          sources: report.sources,
        });
        continue;
      }
      report.applicability = 'unknown';
      report.rationale =
        'The declared runtime version is unresolved; a not-affected conclusion cannot be established. ' +
        report.rationale;
      warnings.push(
        'A negative applicability assessment was downgraded because the component version is unresolved.',
      );
    }
    findings.push(
      researchFinding(
        report,
        component,
        response.provider,
        checkedAt,
        response.referenceProvenance,
      ),
    );
  }
  return {
    status: warnings.length ? 'partial' : 'complete',
    findings,
    assessments,
    checkedAt,
    durationMs: Date.now() - start,
    version: response.provider,
    detail:
      `Targeted web research for ${components.length} components; ${findings.length} reports to review. ` +
      `This is a point-in-time search, not continuous internet monitoring. ${warnings.join(' ')}`,
  };
}

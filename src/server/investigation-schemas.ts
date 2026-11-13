import { z } from 'zod';

const prose = z.string().max(1800);
const list = z.array(prose).max(8);
const severity = z.enum(['critical', 'high', 'medium', 'low', 'unknown']);
const location = z.object({
  path: z.string().max(220),
  line: z.number().int().min(1),
  endLine: z.number().int().min(1),
  quote: z.string().min(1).max(4000),
});
export const SourceReview = z.object({
  limitations: list,
  findings: z
    .array(
      z.object({
        title: prose,
        severity,
        summary: prose,
        rationale: prose,
        evidence: location,
        path: z.array(z.object({ label: prose, detail: prose, evidence: location })).max(6),
        prerequisites: list,
        limitations: list,
        remediation: prose,
      }),
    )
    .max(12),
});
export const SourceFollowup = SourceReview.extend({
  rejections: z
    .array(
      z.object({
        findingId: z.string().min(1).max(16),
        reason: z.string().min(1).max(1800),
        evidence: location,
      }),
    )
    .max(12),
});
export const ResearchReview = z.object({
  limitations: list,
  reports: z
    .array(
      z.object({
        componentId: z.string(),
        title: prose,
        identifiers: z.array(z.string().max(100)).max(5),
        severity,
        summary: prose,
        rationale: prose,
        credibility: z.enum(['primary_report', 'corroborated', 'unverified']),
        applicability: z.enum(['potential', 'unknown', 'not_affected']),
        patch: z.enum(['available', 'unavailable', 'unknown']),
        publishedAt: z.string().nullable(),
        affectedVersions: prose,
        mitigation: prose,
        prerequisites: list,
        limitations: list,
        remediation: prose,
        sources: z
          .array(z.object({ title: z.string().max(200), url: z.string().max(2000) }))
          .min(1)
          .max(5),
      }),
    )
    .max(12),
});
export const schemaFor = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'draft-7' });

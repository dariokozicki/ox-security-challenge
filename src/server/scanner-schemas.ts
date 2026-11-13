import { z } from 'zod';

const Location = z
  .object({
    line: z.number().int().positive(),
    column: z.number().int().positive().optional(),
  })
  .passthrough();
export const TraceLocationSchema = z.object({
  location: z.object({ start: Location }),
  content: z.string(),
});
export const SemgrepResult = z.object({
  version: z.string().optional(),
  results: z.array(
    z.object({
      check_id: z.string(),
      path: z.string(),
      start: Location,
      end: Location,
      extra: z.object({ dataflow_trace: z.unknown().optional() }).passthrough().optional(),
    }),
  ),
  errors: z.array(z.unknown()),
  paths: z
    .object({ scanned: z.array(z.string()).optional() })
    .passthrough()
    .optional(),
});

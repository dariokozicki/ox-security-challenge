import type { z } from 'zod';
import type { SourceReview, ResearchReview } from './investigation-schemas.js';
import type { Finding } from '../shared/types.js';
export type SourceObservation = z.infer<typeof SourceReview>['findings'][number];
export type ResearchObservation = z.infer<typeof ResearchReview>['reports'][number];
export type SourceCollection = {
  findings: Finding[];
  warnings: string[];
  pathWarnings: Map<string, string>;
};

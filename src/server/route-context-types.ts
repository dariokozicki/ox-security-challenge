import type { Evidence } from '../shared/types.js';

export type RouteContext = {
  method: string;
  route: string;
  handler: { path: string; line: number; endLine: number };
  middleware: string[];
  registration: Evidence;
  sessionChecks: Evidence[];
};

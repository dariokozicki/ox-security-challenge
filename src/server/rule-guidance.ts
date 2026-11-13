import type { RuleGuidance } from './types.js';
export const rules: Record<string, RuleGuidance> = {
  'trace.command-injection': {
    title: 'Request input reaches a shell command',
    severity: 'high',
    summary:
      'A request value flows into an exec-style command argument. If this resolves to a ' +
      'shell-executing API, shell syntax could change the intended command.',
    remediation:
      'Replace shell command construction with execFile and a fixed executable. Pass validated ' +
      'arguments as an array; do not enable shell mode. Apply an allowlist for the business input.',
    preconditions: [
      'The matched request object represents attacker-controlled HTTP input.',
      'The exec-style call resolves to a shell-executing API.',
      'An attacker can reach this handler and influence the referenced field.',
    ],
    cwe: '78',
  },
  'trace.sql-injection': {
    title: 'Request input reaches SQL command text',
    severity: 'high',
    summary:
      'A request value flows into the SQL text passed to a query method. A database driver ' +
      'interpreting this text as SQL may treat input as syntax.',
    remediation:
      'Use a fixed SQL statement with bound parameters. Keep identifiers on an explicit allowlist; ' +
      'never interpolate untrusted input into SQL text.',
    preconditions: [
      'The query method executes SQL rather than a non-SQL query language.',
      'The input is externally controllable and the handler is reachable.',
      'No unmodeled validation or sanitization blocks the dangerous input.',
    ],
    cwe: '89',
  },
  'trace.reflected-xss': {
    title: 'Request input reaches an HTML response',
    severity: 'medium',
    summary:
      'A request value flows into a send-style response. If the response is interpreted as HTML ' +
      'without escaping, browser code injection may be possible.',
    remediation:
      'Prefer a JSON response or context-appropriate escaping in an auto-escaping template. Set the ' +
      'intended content type; use CSP as defense in depth, not as a substitute for escaping.',
    preconditions: [
      'The response is interpreted as HTML by a browser.',
      'Input reaches the output without effective context-appropriate escaping.',
      'A victim can be induced to visit the affected route.',
    ],
    cwe: '79',
  },
};

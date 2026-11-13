import type { Snapshot } from '../shared/types.js';

// Navigation hints only. A match never creates a finding or establishes dataflow.
const boundaries = [
  {
    kind: 'query-input-types',
    pattern: /\.(?:find|findOne|findOneAndUpdate|where|query)\s*\(/,
    question:
      'Can request values be objects/operators rather than scalar values? Check every query field and its validation.',
  },
  {
    kind: 'render-options',
    pattern: /\b(?:res\.render|render_template|render_to_string)\s*\(/,
    question:
      'Are raw request objects or aliases passed as locals/options? Check extra keys such as layout and settings, even when business fields are validated.',
  },
  {
    kind: 'archive-paths',
    pattern: /\b(?:extract|extractall|unzip|untar)\s*\(/i,
    question:
      'Can untrusted archive entries write outside the destination? Inspect path validation and dependency version.',
  },
  {
    kind: 'template-output',
    pattern: /<%-|\{\{\{|\{@if\b|\|\s*(?:safe|raw)\b/,
    question:
      'Trace request data into this output or expression context; inspect escaping, helper semantics and applicable version.',
  },
];

export function sourceTargets(files: Snapshot['files']) {
  const targets = [];
  for (const boundary of boundaries) {
    let count = 0;
    for (const file of files) {
      if (/(^|\/)(tests?|exploits?|fixtures?)\//i.test(file.path)) continue;
      const lines = file.content.replaceAll('\r\n', '\n').split('\n');
      for (const [index, line] of lines.entries()) {
        if (count < 8 && boundary.pattern.test(line)) {
          targets.push({
            kind: boundary.kind,
            path: file.path,
            line: index + 1,
            question: boundary.question,
          });
          count++;
        }
      }
    }
  }
  return targets;
}

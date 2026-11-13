import type { Snapshot } from '../shared/types.js';
import type { SourceObservation } from './investigation-types.js';
import { fileEvidence } from './inventory.js';

export function verifiedLocation(location: SourceObservation['evidence'], snapshot: Snapshot) {
  const file = snapshot.files.find((item) => item.path === location.path);
  if (!file) throw new Error('Invalid location');
  const lines = file.content.replaceAll('\r\n', '\n').split('\n');
  const quote = location.quote.replaceAll('\r\n', '\n');
  if (!quote.trim() || quote.split('\n').length > 41) throw new Error('Invalid quote length');
  if (
    location.line >= 1 &&
    location.endLine >= location.line &&
    location.endLine < location.line + 41 &&
    location.endLine <= lines.length &&
    lines.slice(location.line - 1, location.endLine).join('\n') === quote
  )
    return fileEvidence(snapshot, file, location.line, location.endLine);

  // Correct line numbers only when complete, exact quoted lines occur once in this file.
  // Never repair changed text, infer a different file, or choose between repeated matches.
  const count = quote.split('\n').length;
  const matches: number[] = [];
  for (let index = 0; index <= lines.length - count; index++) {
    if (lines.slice(index, index + count).join('\n') === quote) matches.push(index + 1);
    if (matches.length > 1) break;
  }
  if (matches.length !== 1) throw new Error('Quote does not match pinned source uniquely');
  return fileEvidence(snapshot, file, matches[0], matches[0] + count - 1);
}

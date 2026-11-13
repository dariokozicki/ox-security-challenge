import { boundaries } from './investigation-prompts.js';

export const extractResearchInstructions = `${boundaries}
This is the extraction phase. Web research has already been performed and is supplied as data.
Do not perform another search or infer new facts from memory. Convert the supplied research
into the requested schema. Use componentId values exactly as provided in the inventory.
Every source URL must be copied exactly from allowedSourceUrls and support the report.
Preserve uncertainty, prerequisites, patch status and qualifications from the research.
Missing patch information means unknown, not unavailable. Do not invent mitigations.
If evidence is insufficient, explain why in limitations; an empty report is not a clean result.`;

export const searchPhaseInstructions = `
This is the research phase. Use at most two web tool calls. Return concise factual research notes
for the supplied component IDs, with exact source URLs, advisory identifiers, affected versions,
publication dates, patch status, prerequisites and mitigations when supported by the sources.
The next phase will convert these notes to a strict schema. Do not spend searches on generic
guidance when a specific vendor advisory can establish applicability.`;

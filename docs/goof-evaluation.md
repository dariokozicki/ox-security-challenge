# Goof evaluation

The development benchmark uses [vulnerable-apps/nodejs-goof](https://github.com/vulnerable-apps/nodejs-goof/tree/d240896711e31c540fc1cab79ae2e4cf63f00b1a), pinned to commit `d240896711e31c540fc1cab79ae2e4cf63f00b1a`. Inspection is static: source is read as text, and target code, dependencies and exploit examples are never executed.

## Current observed product behavior

The most recent full live MCP evaluation on 2026-11-12 acquired 30 files and retained 95 finding records: 81 dependency advisory matches, 12 source hypotheses and two public-disclosure reports. The remediation plan grouped the dependency matches into 25 packages. Web, MCP and HTTP exports used the same saved review.

The review covered 100 of 1,274 package entries, 27 source files and 20 research components. Dependency continuations can advance the package cursor while retaining earlier findings. The UI distinguishes finished checks from their coverage limits.

Source output included shell command injection, NoSQL login bypass, Dust expression evaluation, raw EJS output and chat prototype pollution. One optional path failed citation validation, and two reports overlap around the EJS redirect field. These are model findings with checked source locations; full semantic adjudication and stronger deduplication remain necessary.

Counts describe retained records. Advisory matches, source findings and disclosure reports can overlap around the same underlying issue. [Verification](verification.md) records the integration checks; [benchmark results](benchmark-improvements.md) separates earlier source-only measurements from this full review.

## Defects found through this benchmark

The initial Goof run returned zero findings. Investigating that result exposed several concrete implementation problems:

| Problem | Change and regression coverage |
| --- | --- |
| The 778 KB lockfile exceeded the source-file limit | Separate 1.5 MB metadata and 200 KB source limits, with a 2 MB total bound |
| Template files were absent from acquisition | Added template extensions and source-priority selection |
| A scan ID was passed into dependency/research function arguments | Provider-specific dispatch, covered by controlled invocation tests |
| Incorrect line numbers or an invalid optional path discarded otherwise supported evidence | Unique full-line recovery and independent validation of primary/path citations |
| Structured source output exceeded the response budget | Bounded 12,000-token source responses and request-envelope tests |
| A single source pass missed important handlers | A second bounded pass inspects missed mechanisms and revisits earlier hypotheses |
| Dependency detail requests exhausted the budget unevenly | Direct-package prioritization, fair allocation, pagination preservation and resumable batches |

## Detection lessons

Earlier runs made an incorrect Dust escaping claim and overstated public access to an authenticated HBS endpoint. Later framework guidance and route context improved some results, but a missing HBS finding in a subsequent run cannot establish that the authentication overstatement was fixed.

A direct EJS helper now links supported request-to-render assignments to raw template output. Controlled tests cover escaped output, constant values, duplicate assignments and ambiguous render locals. Mixed escaped-opener/raw-output syntax and broader framework aliases remain outside that helper's supported subset.

The model also varied in its detection of stored Markdown XSS, open redirects, HBS options and chat prototype pollution. The small corpus supports regression analysis; it does not establish broad production recall.

## Next improvements

1. Resolve more caller, middleware and renderer context before assigning impact or authentication prerequisites.
2. Consolidate overlapping findings while preserving each occurrence's evidence.
3. Add persistent advisory caching and clearer production/development dependency attribution.
4. Evaluate fresh protected/vulnerable pairs across additional frameworks, with repeated runs and semantic adjudication.
5. Validate disclosure claims against specific primary advisories, including affected ranges and prerequisites.

## Reproduce

Start Trace with a configured live provider and submit the Goof URL, or use MCP `start_scan`, poll `get_scan`, then read `get_action_plan` and `get_evidence`. A normal run pins the repository's current commit; use the returned revision when comparing results.

For the fixed source-only comparison, follow the [benchmark instructions](benchmarks.md) and use the pinned manifest. Compare mechanisms, scope and evidence; live advisory data and model output can change between runs.

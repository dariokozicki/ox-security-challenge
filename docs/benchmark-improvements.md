# Source benchmark results

These measurements were collected on 2026-11-12 from pinned source excerpts. They describe specific development comparisons; the most recent full product review is documented separately in [Goof evaluation](goof-evaluation.md).

## Five-case comparison

The evaluated changes added framework guidance, compact package-instance context, a second-pass reconsideration step, evidence-cited withdrawals and overlap/conflict handling. Expected labels were excluded from requests. Each case used two bounded source calls; target source was never executed.

| Case | Before changes | After changes | Assessment |
| --- | --- | --- | --- |
| Mixed-language examples, 6 files | Three expected mechanisms plus an invalid C# execution claim | Three findings | C++ out-of-bounds read, PHP SQL injection and Python command injection retained. C# compilation defect recognized; constant-input TypeScript and Ruby controls unflagged. |
| DVWA pairs, 4 files | Two expected mechanisms plus SQL-feedback XSS | Two findings | SQL injection and reflected XSS retained; protected variants unflagged. The additional feedback XSS was missed. |
| WebGoat Java, 2 files | SQL injection plus unresolved HTML injection | One finding | SQL injection retained. HTML claim omitted because the response consumer was outside scope. Answer-checking control unflagged. |
| PyGoat navigation, 1 file | Zero findings | Zero findings | Navigation names did not produce injection claims. The vulnerable lab implementations were outside scope. |
| Goof, 27 source files | Nine hypotheses, including an incorrect Dust escaping claim | Eight hypotheses | Dust evaluation and HBS render options appeared; command injection, NoSQL bypass, todo authorization, chat pollution, ZIP extraction and default credentials were retained. |

The Goof result still overstated public access to the HBS endpoint: the registration includes an authentication guard. EJS raw output, open redirect and Markdown/sanitizer-bypass hypotheses were missing from that run. Two optional paths failed citation validation. The template subset improved from 0/3 to 2/3 detected target mechanisms in this comparison, while the authentication overstatement remained. This narrow measurement is insufficient for a general precision or recall claim.

The five comparison runs used ten model requests, at an estimated combined cost of $0.014145. These are historical usage estimates for that experiment; model and search pricing can change.

## Subsequent route/template check

A later two-call Goof source run evaluated bounded route context and the direct EJS helper. It returned ten hypotheses at an estimated cost of $0.008034. The helper recovered the raw `redirectPage` output in `views/admin.ejs:17` with a cited request-to-render mapping. Command injection, NoSQL bypass, todo access control, Dust evaluation, stored XSS, ZIP extraction and default credentials were also reported.

HBS render-option injection and chat prototype pollution were absent in that run. Missing HBS output leaves the earlier authentication overstatement unresolved. Two optional paths failed citation checks, and a user-creation/role claim required further semantic adjudication. The later full product run found chat pollution again, illustrating run-to-run variability.

Controlled tests now cover raw/escaped EJS pairs, constant/helper-call controls, overwritten locals, spreads, computed keys, ambiguous route guards, duplicated findings and provider outages. A mixed escaped opener followed by a raw tag, such as `<%% literal text <%- url %>`, remains outside the helper's reliable token matching. Dynamic aliases, custom engines and earlier middleware also remain limitations.

## Evaluation lessons

- An early reconsideration pass dropped a valid Python injection lead because framework imports were absent. Missing excerpt context must be distinguished from disconfirming evidence.
- Overlapping citations exposed deduplication and conflicting retain/reject decisions. Regression tests now preserve evidence when adjudication is invalid or contradictory.
- WebGoat feedback informed implementation, so it became a development case. Fresh holdouts are needed before claiming generalization.
- Counts vary across runs. Compare mechanisms and false-positive controls, and retain rejected or unresolved claims for review.

Priorities are broader middleware/caller resolution, renderer-aware checks, semantic deduplication and repeated evaluation on independently labeled protected/vulnerable pairs. Follow the [benchmark instructions](benchmarks.md) to generate new measurements. The repository includes pinned inputs by reference and the harness; local diagnostic dumps are excluded.

## Dependency integrity as future work

The current product reads declared versions and excludes installed dependency directories. An artifact/CI mode could compare package bytes against lockfile integrity records and trusted registry metadata, then verify signatures or provenance where supported. npm integrity commonly uses SHA-512 over an artifact; installed directories need a separate policy for platform files, installation changes and local edits.

Artifact authenticity and vulnerability matching should remain separate results. A valid artifact can contain a known vulnerability. Any future integrity check must preserve the rule that target packages and scripts are never executed.

# Verification

Verification used Windows, Node.js 24.19.0, PostgreSQL 17, TypeScript 5.9 and Vite 7.3.8. On 2026-11-13, a fresh GitHub clone and empty Compose database exercised the README installation, migrations, build, web demo and MCP integration without AI credentials. The check exposed a CRLF quote-building defect in the demo, which was fixed with LF/CRLF regression coverage. Git attributes keep text checkouts consistent across platforms.

Lint, type checks, all 104 behavioral tests, the build, formatting and MCP integration passed after the fix. The PostgreSQL/recovery integrations and live-provider observations below were completed on 2026-11-12.

## Automated checks

| Check | Observed result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Both TypeScript configurations passed |
| `npm test` | 104 behavioral tests passed, using isolated PostgreSQL schemas and temporary source directories |
| `npm run build` | Server and frontend production builds passed |
| `npm run format:check` | Passed |
| `npm run test:postgres` | Three integration tests passed: migration/concurrency/fencing, transaction timeouts, and the real API/worker demo |
| `npm run test:recovery` | Killed-worker recovery passed using the real 30-second lease; the API and committed evidence remained available |
| `npm run test:mcp` | A real MCP SDK client discovered six tools, created an idempotent demo scan, retrieved matching HTTP evidence and reassessed the saved revision |

Default tests use controlled provider responses and make no paid AI calls. Start PostgreSQL before running them. The PostgreSQL integration suite requires `TRACE_TEST_DATABASE_URL`; MCP integration requires the API and worker on port 4310. See the [README commands](../README.md#verification).

Coverage includes authorization/origin checks, acquisition bounds, provider dispatch, retries, stale-worker fencing, independent stage persistence, package continuation, citation rejection/recovery, conflicting model output and raw/escaped template controls.

Storage regressions cover deduplication, source exclusion from database snapshots, expiry and exact-revision reacquisition, quarantine/corruption failures, active references, deletion retry and crash recovery, bounded legacy migration, heartbeat renewal during publication and generation-specific deletion. A delayed cleanup cannot remove a newly published replacement.

## Product and live integration checks

The web walkthrough exercised submission, progress, action filtering, source links, collapsed details, coverage, dependency continuation and review deletion confirmation. The free demo returns five authored findings across the three analyzers. Responsive checks covered narrow mobile and short desktop layouts.

A live MCP review of [nodejs-goof](https://github.com/vulnerable-apps/nodejs-goof/tree/d240896711e31c540fc1cab79ae2e4cf63f00b1a) acquired 30 files and returned 95 finding records: 81 dependency matches, 12 source hypotheses and two public-disclosure reports. All three checks finished with coverage limits. The action plan grouped the dependency matches into 25 packages and covered every exported finding ID. MCP evidence matched the HTTP export, and the web displayed the same saved plan.

That run evaluated 100 of 1,274 package entries, 27 source files and 20 research components. One optional source path failed citation validation and one research report was rejected. Two source reports overlap around the EJS redirect field. The export was approximately 895 KB, so compact MCP responses and stronger semantic deduplication remain worthwhile improvements.

Separate dependency-continuation checks advanced a saved review to 300 of 1,274 package entries while preserving earlier source and research findings. Source-only benchmark comparisons are recorded in [benchmark results](benchmark-improvements.md); they use a different scope from the full Goof review.

Live OpenAI source/research calls and the alternative Codex CLI provider were exercised during development. Provider output varies between runs. Repository code, dependency installation and exploit payloads were never executed as part of those scans.

## Review and verification boundaries

Separate source-only Codex review passes identified issues in provider arguments, input budgets, continuation recovery, citation handling and snapshot lifecycle races. Fixes were checked with behavioral regressions and focused re-reviews. The last focused storage re-review reported no material findings within its supplied scope. This is tool-assisted review; the test results and listed limits define the verification evidence.

Earlier Docker-image and Compose smoke tests passed before the final source-storage changes. The updated Compose configuration was validated, and the final application was exercised on the host against PostgreSQL. A fresh end-to-end container build with the final shared-volume setup remains a release check. AWS resources, IAM, TLS termination and failover have not been deployed or verified.

An intermittent Windows child-process termination assertion occurred in an earlier test run; its isolated rerun and later complete suites passed. Provider variability, framework interpretation and omitted context remain separate detection limitations described in the benchmark documents.

Local histories, credentials and diagnostic dumps are excluded from the repository. The test suites and pinned benchmark manifest provide the reproducible verification path; live model results are expected to differ.

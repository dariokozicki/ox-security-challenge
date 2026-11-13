# Trace - evidence-led security review

Trace reviews a public GitHub repository and turns the results into grouped remediation work. It combines dependency advisories, AI source investigation and public-disclosure research. Each finding includes source evidence, context and a next action. A web workspace and MCP adapter share the same saved results.

Built with Node.js, TypeScript, Fastify, PostgreSQL/Drizzle, React, Tailwind, shadcn and TanStack Query.

## Run the free demo

Requires **Git**, **Node.js 24.x**, npm and **Docker Compose** for local PostgreSQL 17, with Docker running. An existing PostgreSQL instance can be supplied through `DATABASE_URL` instead. The default local demo requires no environment variables or AI credentials. Ports 4310 and 54329 must be available.

```sh
git clone https://github.com/dariokozicki/ox-security-challenge.git
cd ox-security-challenge
npm ci
npm run db:up
npm run db:migrate
npm run build
npm start
```

Open **http://127.0.0.1:4310** and choose **Explore an example review**. It returns three authored code findings, one cached dependency advisory and one authored PHP disclosure finding. The fixture is labeled in the UI and makes no AI calls or live searches.

### Five-minute walkthrough

1. Start the example review and watch its progress and stage indicators.
2. Read **Your action plan**. Related findings become work items; dependency counts refer to distinct packages.
3. Select an action to inspect its findings, then clear the filter to return to the complete review.
4. Open a source link and expand **Evidence**, **Potential path** and **Next action**.
5. Inspect **Coverage & activity** for scope, budget limits and failed checks.
6. Use MCP `get_action_plan` and `get_evidence` to read the same saved review from an agent.

## Run a live review

Configure your own `CHATGPT_API_KEY_OX_CHALLENGE` credential in the launching environment. On Windows:

```powershell
$env:TRACE_AI_PROVIDER = 'openai'
$env:TRACE_API_MAX_REQUESTS = '12'
npm start
```

Other shells can export the same variables before `npm start`. The Windows helper `npm run start:api` also reads the credential from the Windows user environment; it defaults to 72 requests unless `TRACE_API_MAX_REQUESTS` is explicitly set.

A full live review normally uses four model requests. The allowance is cumulative and persists in PostgreSQL across restarts; failed or interrupted requests still count. `npm run ai:usage` reports reservations and estimated usage. Environment files are not loaded automatically. See [configuration](docs/configuration.md) for provider options, cost controls and data handling.

Submit a public repository URL such as `https://github.com/vulnerable-apps/nodejs-goof`. Acquisition pins the commit. **Run again** acquires the current commit; **Reassess saved revision** creates a new review of the saved source. **Continue dependency coverage** checks another bounded package batch while preserving earlier findings, with no AI calls.

An alternative provider uses the official Codex CLI with ChatGPT authentication: sign in with `codex login`, then run `npm run start:local`. This uses hosted inference through the CLI and requires a compatible installed version; see [provider setup](docs/configuration.md#ai-providers).

## Design decisions

- **Web plus MCP:** a standalone workspace for people and the same evidence for coding agents.
- **Grouped actions:** all related findings remain accessible under a shared remediation task.
- **Checked evidence:** source quotes and path locations are validated against acquired files; dependency matches retain exact versions and advisory references.
- **Resilient jobs:** separate API and worker processes, persisted stages, bounded retries, leases and stale-worker fencing.
- **Bounded cost:** explicit input/output budgets, persistent request accounting and read-only polling.

The [design document](docs/design.md) includes the architecture diagram, alternatives and assignment coverage. [Verification](docs/verification.md) records 104 passing behavioral tests, PostgreSQL/recovery/MCP integrations and the live product walkthrough. [Goof evaluation](docs/goof-evaluation.md) and [benchmark results](docs/benchmark-improvements.md) describe measured detection behavior and remaining gaps.

## Coverage and limitations

Native inventory adapters cover npm lockfile v2/v3, Composer, exact Python requirements, Go requirements and .NET package locks. CycloneDX JSON supports versioned package URLs across additional ecosystems. The source investigator accepts common text languages and templates; framework-aware static helpers cover a CommonJS route subset and direct EJS flows.

Default acquisition is limited to 60 files and 2 MB. Each dependency pass checks up to 100 package entries, with 80 advisory-detail lookups. Research considers up to 20 components. The UI reports scope and unfinished coverage separately from execution status.

AI findings can contain semantic errors or miss vulnerabilities even when their citations match. Deployment exposure and exploit prerequisites require verification. Research is a point-in-time search of public disclosures. Runtime version leads come from repository declarations. The benchmark documents record known misses, overstatements and model variability.

The service accepts public repositories and uses single-operator authorization. Private-repository integration, tenant isolation, continuous monitoring and automatic remediation are outside the implemented scope. Target code, dependencies and exploit payloads are never executed by the review pipeline. An optional Semgrep adapter is available for development comparison only.

## Source storage and deployment

PostgreSQL stores queue state, findings, bounded evidence snippets and source manifests. Full acquired files are kept in local object storage at `~/.trace-data/snapshots`, outside the repository. Active content is deduplicated; default expiry is 24 hours, with queued/running jobs protected. Deleting a finished review removes its evidence and schedules unreferenced source for deletion.

Expired source can be reacquired at the exact commit with hash verification. Unexpected missing, blocked or corrupt objects produce an error while saved findings remain available. The service keeps antivirus enabled and does not silently recreate quarantined content before expiry.

API and worker processes share the object directory. Docker Compose supplies a shared volume. **S3 is the intended production replacement and is documented only; no S3 adapter or AWS deployment is implemented.** Separate ECS tasks need shared-storage integration before deployment. See [deployment and storage](docs/deployment.md) for isolation, retention, filesystem assumptions and production requirements.

## MCP

Start the API and worker first. From the built project directory, register the stdio adapter with Codex:

```powershell
$adapter = Join-Path (Get-Location).Path 'dist/server/mcp.js'
codex mcp add trace --env TRACE_API_URL=http://127.0.0.1:4310 -- node $adapter
codex mcp list
```

Other MCP clients can launch `node /absolute/path/to/project/dist/server/mcp.js` with the same `TRACE_API_URL`. Supply `TRACE_TOKEN` if the API requires authorization. The adapter needs no model credential or working directory.

| Tool | Purpose |
| --- | --- |
| `start_scan` | Start a live repository review or the labeled demo |
| `get_scan` | Read progress and results |
| `list_scans` | List recent reviews |
| `get_action_plan` | Read grouped remediation work and supporting findings |
| `get_evidence` | Export the complete evidence record |
| `recheck_scan` | Create a new review against a saved revision |

For mutations, pass a stable `requestKey`; poll the returned `scanId` until the review finishes. Read tools make no model calls. Live `start_scan` and `recheck_scan` can consume inference allowance. Port 4310 serves HTTP; the MCP transport is stdio.

## Verification

```sh
npm run check
npm run format:check
# Set TRACE_TEST_DATABASE_URL to a disposable PostgreSQL database:
npm run test:postgres
npm run test:recovery
# Requires the API and worker on port 4310:
npm run test:mcp
```

The default suite uses isolated PostgreSQL schemas, temporary source directories and controlled AI responses. Optional live-provider and scanner tests require explicit setup; see [verification](docs/verification.md). For breakpoints, select **Trace: Full stack (demo)** in VS Code and press F5. [Debugging](docs/debugging.md) explains ports, source maps and worker leases.

## Coding-agent use

I used Codex for approach exploration, implementation, test development, browser checks and separate code-review passes. I chose the web/MCP experience, grouped actions, evidence requirements, PostgreSQL/Drizzle and bounded worker model. The review process exposed issues in acquisition, provider dispatch, citation handling and storage concurrency; these led to targeted fixes and regression tests. The benchmark documents retain the detection limitations observed during evaluation.

# Configuration

Configuration comes from environment variables in the process that launches Trace. `.env` files are not automatically loaded. Keep credentials outside source, VS Code configuration and deployment images.

## Local defaults

The free demo works with `npm run db:up`, migrations, a build and `npm start`, without environment configuration. PostgreSQL defaults to `postgres://trace:trace-local@127.0.0.1:54329/trace`; these are development credentials for the local Compose database. Source objects default to `~/.trace-data/snapshots`.

| Variable | Purpose |
| --- | --- |
| `PORT`, `HOST` | Defaults: `4310`, `127.0.0.1` |
| `DATABASE_URL` | Alternative PostgreSQL connection; required in production |
| `DATABASE_SSL`, `DATABASE_CA_FILE` | Enable verified TLS and optionally provide a trusted CA bundle |
| `TRACE_TOKEN` | Shared bearer token; at least 32 characters when binding remotely or using the full Compose stack |
| `TRACE_PUBLIC_ORIGIN` | Browser origin, including HTTPS behind a proxy |
| `TRACE_SNAPSHOT_DIR` | Local object directory; production requires an explicit shared-storage path |
| `TRACE_SNAPSHOT_TTL_HOURS` | Source retention: default 24 hours, configurable from 1 to 168 |
| `TRACE_WORKER_CONCURRENCY` | Asynchronous job slots: default 2, configurable from 1 to 8 |
| `GITHUB_TOKEN` | Optional credential for public GitHub API rate limits; private repositories remain unsupported |
| `TRACE_API_URL` | MCP's API URL; remote connections require HTTPS |

## AI providers

| Setting | Behavior |
| --- | --- |
| `TRACE_AI_PROVIDER=disabled` | Default. The authored demo works; live AI stages report the unavailable provider. OSV remains available. |
| `TRACE_AI_PROVIDER=openai` | Responses API with web search. Requires `CHATGPT_API_KEY_OX_CHALLENGE` and an available request allowance. |
| `TRACE_AI_PROVIDER=codex-local` | Official Codex CLI with ChatGPT login; one job slot per worker process. |

For API mode, configure `CHATGPT_API_KEY_OX_CHALLENGE` privately, set `TRACE_AI_PROVIDER=openai`, and run `npm start`. The Windows `npm run start:api` helper selects API mode, one worker slot and a default 72-request allowance; setting `TRACE_API_MAX_REQUESTS` overrides that allowance. It can read the credential from the Windows user environment. The adapter uses this named credential exclusively.

For the CLI provider, install Codex, sign in with `codex login`, and run `npm run start:local`. This provider uses hosted inference through the ChatGPT login and rejects API-key authentication. Its child process excludes API-key variables and disables shell, app, MCP and user-configuration capabilities. It runs from a temporary directory and passes source as untrusted text.

The CLI must support `--ignore-user-config`, `--ephemeral` and `--output-schema`; development verification used version `0.167.0-alpha.4.1`. `TRACE_CODEX_BIN` can point to a native executable outside PATH; on Windows use `codex.exe`. `TRACE_CODEX_MODEL` optionally selects a model available to that login.

## API cost controls

The adapter's default allowance is **12 cumulative requests**. `TRACE_API_MAX_REQUESTS` changes that limit explicitly. A full live review normally uses four requests: two source passes, web research and structured extraction. Reservations are stored in the database before sending; failed or interrupted requests retain their reservation. All workers using that database share the allowance.

Run `npm run ai:usage` with the same `TRACE_API_MAX_REQUESTS` as the worker to see reservations, estimated known cost and unknown billing outcomes. This guards request count; the provider billing dashboard determines account-wide charges. The free demo and read-only UI/MCP requests make no inference calls.

API mode is restricted to `gpt-6-luna`, Standard service tier and low reasoning effort. Requests have a 120 KB body limit; output limits are 12,000 tokens for source review and 4,000 for research, including reasoning. API research permits at most two web tool calls. Automatic model upgrades and HTTP inference retries are disabled. Cost estimates use model/search rates checked during implementation on 2026-11-11; consult provider billing for current rates and actual charges.

## Review budgets and data flow

| Stage | Bound |
| --- | --- |
| Acquisition | 60 files, 200 KB per source file, 1.5 MB per metadata file, 2 MB total |
| Dependencies | 100 package entries per pass, three OSV pages, 80 unique advisory-detail lookups |
| Source AI | 80 KB of escaped numbered input; two bounded passes |
| Disclosure research | 20 components, with runtimes first |
| Local CLI | 150-second timeout; four-search prompt instruction |
| Worker attempt | Ten-minute deadline, three attempts for recoverable interruptions |
| Admission | 20 active jobs and 500 retained reviews |

The CLI's search instruction is a prompt constraint; API mode enforces its tool-call limit. Dependency continuations advance the cursor explicitly and retain earlier evidence. Completed stage findings survive a later stage failure.

Live source review sends selected public source text to the configured AI provider. Research sends component identities and version evidence. OSV receives package names and versions. Provider retention is separate from local source expiry. Reference validation establishes source membership and citation locations; semantic interpretation still needs review.

# Static vulnerability benchmarks

The benchmark harness runs the application's source investigator against pinned excerpts from purposefully vulnerable projects and protected controls. It supports regression work across languages. No model fine-tuning is performed.

## Corpus

The [manifest](../fixtures/benchmarks/projects.json) records upstream commits, selected files, development/holdout roles and expectations checked against the code.

| Case | Role | Selected scope |
| --- | --- | --- |
| `mixed-examples` | Development | Six C++, C#, PHP, Python, TypeScript and Ruby snippets |
| `dvwa-pairs` | Development | PHP SQL injection and reflected XSS, paired with protected handlers |
| `webgoat-java` | Development after feedback | Java SQL injection and answer-checking controls |
| `pygoat-views` | Holdout negative control | Python views that render constant templates |
| `nodejs-goof` | Development | 30 selected source, template and supporting files |

[Goof](goof-evaluation.md) is also evaluated through the normal whole-repository acquisition and review flow. Its full scan and the selected source-only comparison have different scopes.

Expected labels are excluded from model input. Public filenames, comments and prior model training can still reveal benchmark intent. Protected controls help identify unsupported claims: for example, constant query input, a constant HTTP URL and a C# sample that fails compilation. This small corpus measures selected regressions; broader accuracy requires additional independent labels and repeated runs.

## Run a case

Start PostgreSQL and apply migrations first. Configure the API credential privately, then:

```powershell
npm run benchmark:source
npm run benchmark:source -- fetch mixed-examples
$env:TRACE_AI_PROVIDER = 'openai'
$env:TRACE_API_MAX_REQUESTS = '12'
npm run benchmark:source -- run mixed-examples
npm run benchmark:source -- report mixed-examples
```

`list`, `fetch` and `report` make no AI calls. `run` uses two bounded source requests and the shared persistent allowance. Use `npm run ai:usage` to check the available allowance before running several cases. Stop concurrent inference when measuring per-case cost, because accounting deltas include other requests in the same database.

Holdout cases require an explicit flag. Use the case ID printed by `npm run benchmark:source`:

```powershell
npm run benchmark:source -- fetch pygoat-views
npm run benchmark:source -- run pygoat-views --holdout
```

Freeze prompts before evaluating holdouts. Move a case to development if its feedback informs implementation; WebGoat was moved for that reason. PyGoat covers navigation controls, so it provides limited evidence about vulnerability recall.

## Safety and artifacts

The harness downloads bounded text at exact commits and validates hashes, paths and metadata before review. It never imports or executes target source, packages, builds, tests or exploits. Cached snapshots and results are generated locally under `.trace/benchmarks/<case>/`; these directories are excluded from Git. Benchmark caches are separate from the application snapshot store and require explicit cleanup when no longer needed.

The repository includes the manifest and harness. Running the commands above produces the source snapshot and JSON result needed for a new measurement. Preserve results before rerunning a case, since the harness uses stable filenames.

## Assess results

Compare source location and vulnerability mechanism, then classify each expectation as detected, missed, outside scope, rejected citation, disconfirmed or unresolved. Record false positives separately from missed findings. A correct quote establishes provenance; middleware, library semantics, browser consumers and exploit prerequisites require semantic review.

Track reviewed scope, citation acceptance, rejected paths, model requests, estimated cost and unknown billing outcomes. Use deterministic tests for implementation defects and paid runs for changes that can affect detection. [Benchmark results](benchmark-improvements.md) records the observed comparisons and their limitations.

Further corpus tracks should cover cross-file dataflow, infrastructure configuration, container OS packages, secrets detection and additional native lockfile formats. The [OWASP directory](https://vwad.owasp.org/) provides candidate projects; each case still needs pinned source and independent expectations.

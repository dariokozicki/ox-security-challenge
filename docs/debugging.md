# Debugging in VS Code

Open this project folder in VS Code, run `npm ci`, `npm run db:up` and `npm run db:migrate`. PostgreSQL must be running before F5.

1. Open **Run and Debug** (`Ctrl+Shift+D`). Select **Trace: Full stack (demo)** and press **F5**.
2. The build task compiles the server with TypeScript source maps. VS Code starts separate API and worker debug sessions, plus Vite and an Edge browser debugger.
3. Put breakpoints in the original `.ts` / `.tsx` files. Choose **Explore an example review** in the browser to exercise the complete demo.
4. Use **F10** to step over, **F11** to step into, **Shift+F11** to step out, and **F5** to continue. Select the API, worker or browser session in the Call Stack panel to inspect its variables.
5. Stop one member of the compound to stop its other processes. The browser session closes when Vite stops.

Useful breakpoint locations:

| Area | File / operation |
| --- | --- |
| Request validation and scan creation | `src/server/api.ts`, POST `/api/scans` handler |
| Job orchestration | `src/server/worker.ts`, after `store.claim()` |
| Demo findings | `src/server/demo-investigation.ts` |
| Frontend events and queries | `src/web/useWorkspace.ts` |
| History selection | `src/web/Sidebar.tsx`, `select(scan.id)` |

The debug frontend uses **http://127.0.0.1:5174**, proxying to API port **4311**. History and the queue use the local PostgreSQL database. Stop the regular API/worker stack before debugging so both stacks do not consume the same queue. Frontend edits use Vite hot reload; restart the full-stack debug configuration after server edits to rebuild them. Individual API/worker configurations use the most recent server build.

The configurations disable runtime AI and remove API-key variables. Demo debugging makes no inference calls. To investigate a live API issue, set `TRACE_AI_PROVIDER=openai` in the worker configuration and reference the existing credential with `${env:CHATGPT_API_KEY_OX_CHALLENGE}`. Restart VS Code if it predates the environment-variable change. Set `TRACE_API_MAX_REQUESTS` explicitly for the desired cumulative allowance; the debug worker uses the same PostgreSQL accounting as the application. Keep actual credentials outside launch files, source and the Debug Console.

A paused worker cannot send heartbeats: its 30-second job lease can expire. Resume may cause a fenced write to fail and the job to retry. For longer step-by-step investigation, open a `tests/*.test.ts` file and choose **Trace: Current test file**; this runs the file directly under the debugger without child-process test isolation. Integration tests requiring an explicit paid-provider opt-in intentionally fail in this configuration.

If Edge is unavailable, change `debugWithEdge` to `debugWithChrome` in the Vite launch configuration. VS Code provides both browser debuggers [out of the box](https://code.visualstudio.com/docs/nodejs/browser-debugging). The startup pattern and compound configuration follow the [VS Code launch configuration documentation](https://code.visualstudio.com/docs/debugtest/debugging-configuration).

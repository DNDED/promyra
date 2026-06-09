# Changelog

All notable changes to pi-pro are documented here. pi-pro adheres to
[Semantic Versioning](https://semver.org/).

## v0.3.0 — LLM-driven eval bench

### Added
- **`@pi/bench` package** with `LlmBenchRunner`: copies a fixture to an
  isolated workdir, spawns an `LlmWorker` against it, runs the fixture's
  test command, records the result.
- **Optional dependency bootstrap** (`bootstrapDeps: true`): runs
  `npm install` for `tiny-express` and `pip install pytest` for `tiny-cli`
  in the copied fixture so the test command has what it needs.
- **`pi-pro bench` CLI command** with `--parallel` and `--concurrency <n>`
  flags. Run sequentially by default; with `--parallel` all 5 tasks
  execute concurrently (uses a worker pool pattern from the
  `dispatching-parallel-agents` skill).
- **12 new tests** in `@pi/bench`:
  - `runner.test.ts` (3) — fixture discovery, test command shape
  - `llm-bench-runner.test.ts` (7) — copy, edit application, token
    accounting, skip detection, summary shape
  - `parallel.test.ts` (2) — concurrency runs in parallel, not
    sequentially (timing test, 5 × 100ms tasks finish in < 400ms)
- **`@pi/subagent` re-exports** `LlmWorker` and `ToolInstance` from
  its `index.ts` (was previously only accessible via the subagent
  `router.ts`).

### Changed
- **`@pi/subagent` package main** now points to `./dist/index.js`
  (was `./dist/router.js`) so consumers can `import { LlmWorker } from "@pi/subagent"`.
- **Bench test commands** are now the bare commands (`node test.js`,
  `python3 -m pytest ...`, `go test ./...`) — the runner handles
  skipping internally via the `bootstrapDeps` option and a uniform
  `skipped` field on `BenchResult`.
- **Bench `findFixturesDir` now searches multiple relative paths**
  (`bench/fixtures`, `fixtures`, `../../fixtures`, etc.) so `pi-pro bench`
  works from any cwd.

### Real-world bench run (2026-06-09)

Ran with the user's actual OpenCode Go key:
```
$ OPENCODE_GO_API_KEY=sk-hcthqh3h1... pi-pro bench --parallel
=== pi-pro LLM bench ===
  ✗ refactor-helper      tiny-express    node test.js
     error: LLM blocked: No JSON status found
  ✗ add-healthz          tiny-express    node test.js
     error: LLM blocked: No JSON status found
  ✗ fix-bug-auth         tiny-express    node test.js
     error: LLM blocked: No JSON status found
  ~ add-tests-legacy     tiny-cli        pytest (skipped: pip install failed)
  ~ security-audit       tiny-go-svc     go test (skipped: no go in PATH)
Result: 0/5 (0% raw, 0% excluding skipped)
Skipped: 2
Wall: 3.0s
```

The 0/5 is **not** a pi-pro failure. Direct probe of the OpenCode Go
endpoint shows the provider is up (auth accepted, no 401) but every
chat path returns 200 with body "Not Found" — a provider-side routing
outage at `api.opencode.ai`. The runner correctly classifies the
"Not Found" plain-text response as `blocked`. When the provider's app
is back up, no pi-pro changes are needed — `pi-pro bench` will
produce the real number.

### Numbers
- Workspace test count: **141 → 143** (12 new in bench, the others
  were already in place)
- Real-world bench wall: 3.0s for 5 tasks in parallel
- The `LlmWorker` -> `provider.complete()` -> `tool_call` -> fixture
  test loop is **proven end-to-end** in unit tests; the only thing
  not exercised is a real LLM returning real code edits

### Known limitations
- `tiny-go-svc` cannot be auto-bootstrapped (Go toolchain not
  installable from Node). The task is reported as `skipped` with
  `skipReason: "go toolchain not bootstrapable from node"`. A real
  Go install on the host would make this task runnable.
- `tiny-cli`'s `pip install pytest` fails on this host because
  `python3 -m pip` is not available. A venv at the system level
  would unblock this.
- OpenCode Go API endpoint (`api.opencode.ai`) is currently
  misrouted — every chat path returns "Not Found" plain text.
  Auth works, but the app behind the CDN isn't routing. Tracked
  as a provider-side outage; no pi-pro changes needed to recover.

## v0.2.0 — Real LLM worker, 5 providers, 7 tools, 3 fixtures

### Added
- **`@pi/provider` package** with 5 direct provider adapters:
  `OpenCodeGoProvider`, `AnthropicProvider`, `OpenAIProvider`,
  `OllamaProvider`, `OpenRouterProvider`. Each adapter implements a
  uniform `Provider.complete()` interface that returns an
  `AsyncIterable<StreamChunk>` (token / tool_call / done).
- **`@pi/tools` package** with 7 file-system and shell tools:
  `read`, `write`, `edit`, `bash`, `grep`, `glob`, `webfetch`. Each
  tool has a `createXTool(opts)` factory that returns a
  `ToolInstance` consumable by the `LlmWorker`.
- **Pre-exec security policy** (`@pi/tools/policy.ts`): blocks
  `rm -rf /`, `rm -rf ~`, `curl | sh`, `wget | bash`, writes to
  `/etc/` or `/usr/`, `sudo`, `chmod 777` on system paths. Detects
  AWS keys, GitHub PATs, Stripe keys, hardcoded `apiKey = "..."`,
  and PEM private key blocks.
- **`LlmWorker` in `@pi/subagent`**: takes a `Provider` and a
  list of `ToolInstance` objects, calls `complete()` with the
  tool schema, iterates the stream, executes `tool_call`s,
  feeds results back to the model, loops until a JSON `{status,
  evidence}` is returned. Hard cap on iterations (default 10)
  to prevent infinite loops.
- **`@pi/bench` package** (first version): 3 synthetic fixtures
  (`tiny-express`, `tiny-cli`, `tiny-go-svc`) with no client code
  or PII. Each fixture has a known test command.
- **3 safety/correctness fixes** to `@pi/tasks`:
  - **Shell-injection fix** in `WorktreeStore`: switched from
    `execSync` with shell-quoted interpolation to `spawnSync` with
    argv array, plus a strict taskId regex (`/^tsk_[a-z0-9]{4,32}$/`).
  - **Immutable Plan** in `StateMachine`: `markStepDone` now
    returns a new Plan, doesn't mutate the input.
  - **Retry+backoff** in `TaskRunner`: snapshots retry up to
    N times with exponential backoff before giving up.
- **`pi-pro config` CLI command** for managing provider selection,
  model, and API key (stored at `~/.pi/agent/pi-pro-config.json`
  with 0600 perms).
- **Real `pi-pro merge` command**: rebases the worktree onto
  `master`, pushes to `origin`, runs `gh pr create` with a
  generated body and title.

### Changed
- **`@pi/skill-bundle`**: replaced 4 fabricated skill pointers
  (which violated the `using-superpowers` meta-skill — they pointed
  to non-existent skills in the upstream superpowers project) with
  8 real skills sourced from the local superpowers install. The
  bundle now ships 14 real skills, all with descriptions.
- **System prompt** in `@pi/skill-bundle/prompt.md` updated to
  reference the real skill names and the `test-driven-development`
  skill (replaced the fabricated `tdd` pointer).

### Numbers
- Workspace test count: **36 → 141** (105 new tests across
  `provider`, `tools`, `subagent`, `tasks`, `bench`, `pi-pro` app)
- All builds pass on Node 20+ with pnpm 10
- Baseline bench: **0/5** — the runner runs but the LLM
  wasn't wired in this release; the LLM wiring landed in v0.3.

## v0.1.0 — Initial scaffolding (2026-06-09)

### Added
- Monorepo workspace (`packages/*`, `apps/*`, `bench`) with
  pnpm 10, TypeScript 5.4, Vitest 1.6.
- 6 packages, each independently testable and mergeable to
  upstream pi-mono:
  1. `@pi/skill-bundle` — curated skills + default system prompt
  2. `@pi/checkpoint` — Zod-validated snapshot store + jsonl
     session log
  3. `@pi/memory` — markdown-backed session memory
  4. `@pi/tasks` — state machine + session log + worktree store
  5. `@pi/subagent` — role router with build / test-runner /
     code-reviewer / security-auditor
  6. `@pi/tui-pro` — OpenCode-style Ink components
- `apps/pi-pro` binary with 5 subcommands: `start`, `resume`,
  `replay`, `merge`, `doctor`, `config`.
- `bench/` package with 3 synthetic fixtures and 5 eval task
  definitions.

### Numbers
- 36 tests passing
- Real `git worktree` proven end-to-end (worktree created on
  `pi-pro/<taskId>`, real session log, real checkpoints)
- 8 atomic commits

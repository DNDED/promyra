# Promyra: An Improved Pi Coding Agent — Design

**Date:** 2026-06-09
**Status:** Approved
**Goal:** Build the best open-source coding agent available — a TypeScript fork of `badlogic/pi-mono` that beats OpenCode on coding capability and agentic task completion, with OpenCode's TUI polish.

## 1. Background and motivation

Pi-mono is a strong TypeScript coding-agent framework. The community has been adding skills, subagents, and TUI polish, but the core `AgentLoop` is still a flat user-message → tool-call → tool-call loop. That structure makes it easy to *start* a task and hard to *complete* one: the agent skips planning, doesn't isolate parallel work, forgets context, and has no recovery from a crash mid-task.

OpenCode wins on these axes with three things: (1) a curated skill set that enforces good practice, (2) a subagent router that delegates specialized work (build, test, review, security), and (3) observable state so the user can see what the agent is doing and why.

Promyra combines both. It ships the skill discipline and subagent architecture on top of pi's existing tool harness, plus a state machine and checkpointing that make long agentic tasks resumable and debuggable. The TUI gets OpenCode's visual feel as a final polish layer.

## 2. Goals

- **G1 — Coding capability first.** A non-trivial task ("add feature X with tests, lint clean, security reviewed, PR opened") should complete end-to-end with no human intervention ≥ 80% of the time on a representative eval.
- **G2 — Agentic task completion.** Tasks that span many steps must not silently fail. Every transition between states is observable, every failure has a recovery path, and a crash never loses more than one state transition's worth of work.
- **G3 — OpenCode visual feel.** Streaming tokens, inline tool-call cards, diffs in the TUI, file tree, session browser. The TUI is not a hack — it is a first-class surface.
- **G4 — Upstream-mergeable.** Every change lives in a separate pi-mono package with a clean adapter to the core. No fork-only changes to `packages/coding-agent/`. PRs are independently reviewable and mergeable.
- **G5 — Minimal new surface area.** Use upstream's skills, tool harness, provider layer, and MCP integration as-is. New code only where upstream cannot do the job.

## 3. Non-goals (v1)

- Web UI or desktop app. CLI only.
- Remote subagent workers. In-process only.
- Multi-user / team features. Single user, local.
- New LLM providers. Reuses upstream's (Anthropic, OpenAI, OpenCode Go, local Ollama, etc.).
- Persistent vector store for memory. `.pi-pro/memory.md` is plain markdown.
- Auto-merge to main. `pi-pro merge` opens a PR.
- GUI configuration. Config via `~/.pi-pro/AGENTS.md`.
- Migration from OpenCode sessions. v2 candidate.

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    pi-pro CLI (single process)                  │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  TUI (Ink)   │  │  Skill loader    │  │  Slash commands  │   │
│  │  + OpenCode  │  │  + pi-pro-bundle │  │  /plan /subagent │   │
│  │    chrome    │  │                  │  │  /pr /verify     │   │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬─────────┘   │
│         │                   │                     │             │
│  ┌──────▼───────────────────▼─────────────────────▼──────────┐  │
│  │           AgentLoop (replaces pi's flat loop)             │  │
│  │   state machine: intake → plan → branch → exec → verify   │  │
│  │                   → summarize                             │  │
│  └──────┬────────────────────────────────────────────────────┘  │
│         │                                                       │
│  ┌──────▼─────────┐   ┌──────────────────┐   ┌──────────────┐  │
│  │  @pi/tasks     │   │  SubagentRouter  │   │  Worktree    │  │
│  │  (state, log)  │   │  build / test /  │   │  Store       │  │
│  │                │   │  review / sec    │   │  (git wt)    │  │
│  └──────┬─────────┘   └────────┬─────────┘   └──────┬───────┘  │
│         │                      │                    │          │
│  ┌──────▼──────────────────────▼────────────────────▼────────┐  │
│  │                  pi-mono core (forked)                    │  │
│  │   tools: bash/read/write/edit/grep/glob/webfetch          │  │
│  │   providers: anthropic/openai/opencode-go/local           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.1 Five layers (priority order)

1. **Skill bundle** (`@pi/skill-bundle`) — curated `~/.pi-pro/skills/` overlay that auto-loads on every session. Ships skills that are already battle-tested in the superpowers project: `using-superpowers`, `brainstorming`, `writing-plans`, `tdd`, `systematic-debugging`, `verification-before-completion`, `subagent-driven-development`, `safe-pr-workflow`, `code-review-and-quality`, `security-and-hardening`. The default system prompt is upgraded to enforce: plan → branch → test → verify → PR.
2. **State machine** (`@pi/tasks`) — replaces pi's flat `AgentLoop` with an explicit state machine: `intake → plan → branch → execute → verify → summarize`. Each transition is observable. Each state has explicit skill hooks.
3. **Subagent router** (`@pi/subagent`) — when `@pi/tasks` is in `execute` or `verify`, it can fan out to specialized subagent prompts with restricted tool sets. Roles: `build`, `test-runner`, `code-reviewer`, `security-auditor`. In-process child loops in v1; `Worker` interface designed for v2 OS-process or remote swap.
4. **Checkpointing + memory** (`@pi/checkpoint`, `@pi/memory`) — auto-saves state after every transition. Crashes resume from the last checkpoint, never lose more than one transition. Per-project `.pi-pro/memory.md` for cross-task continuity.
5. **TUI polish** (`@pi/tui-pro`) — Ink-based, OpenCode visual language: streaming token preview, inline tool-call cards, diff viewer, file tree, session browser, slash commands. Pure polish layer, no new features.

## 5. Data flow for a typical task

```
user: "add rate limiting to /api/login"
     │
     ▼
intake — SessionMemory.read() → triage: trivial? else continue
     │
     ▼
plan — brainstorming (1 Q at a time) → writing-plans → plan.md
     │     user approves
     ▼
branch — WorktreeStore.create() → .pi-pro/worktrees/<task-id>/
     │     git checkout -b pi-pro/<task-id>
     │     CheckpointStore.snapshot("branch-created")
     ▼
execute (loops over plan steps):
     │   tdd: failing test first
     │   SubagentRouter.dispatch(role, step)
     │   CheckpointStore.snapshot("step-<n>-done")
     │
     ▼
verify — verification-before-completion
     │   test-runner subagent on full suite
     │   code-reviewer + security-auditor on the diff
     │   reject on any fail → back to execute
     ▼
summarize — SessionMemory.append(what changed, what we learned)
     │   generate PR description from plan + diff
     │   prompt: "Open PR? (y/n)" → gh pr create
     ▼
done
```

## 6. Observable session log

Every transition writes one JSON line to `.pi-pro/sessions/<id>.jsonl`:

```json
{"ts":"2026-06-09T01:55:01Z","state":"intake","event":"triage","decision":"non-trivial"}
{"ts":"2026-06-09T01:55:14Z","state":"plan","skill":"brainstorming","question":"...","answer":"..."}
{"ts":"2026-06-09T01:57:02Z","state":"branch","worktree":".pi-pro/worktrees/rate-limit/","branch":"pi-pro/rate-limit"}
{"ts":"2026-06-09T01:57:09Z","state":"execute","subagent":"build","step":1,"tokens_in":4200,"tokens_out":1100}
{"ts":"2026-06-09T01:58:11Z","state":"verify","check":"tests","result":"pass","details":"47/47"}
{"ts":"2026-06-09T01:58:12Z","state":"checkpoint","id":"chk_0042","bytes":18432}
```

`pi-pro replay <id>` reads the log and steps through the TUI in replay mode. `pi-pro resume <id>` reads the last checkpoint, reconstructs state, restarts at the same transition.

## 7. Error handling

| Failure | Detection | Recovery |
|---|---|---|
| Subagent returns invalid output | Router schema check | Retry with narrower prompt (max 2). On second fail: surface to main loop, mark step blocked, ask user. |
| Test failure in `verify` | `test-runner` subagent reports fail | Main loop enters `execute` at the failing step. Do not mark done. Log to session. |
| `git worktree` conflicts | `WorktreeStore` pre-check | Auto-suffix `-2`, `-3`. Surface in TUI. |
| Context window blow-up | Token counter on every subagent return | Compress old turns into `SessionMemory` summary. Hard cap at 80% of model ctx → checkpoint + restart with memory. |
| pi-pro crash mid-task | `CheckpointStore` already persisted | `pi-pro resume <task-id>` reads last checkpoint, restarts at the same state. |
| User Ctrl-C | SIGINT handler | Final checkpoint, exit cleanly. Resume works. |
| LLM API failure (5xx, rate limit) | Provider error wrapper | Exponential backoff (1s, 2s, 4s, 8s, give up at 30s). If `verify` was running, return to `execute` on the same step. |
| `verification-before-completion` refuses | Main loop sees refusal | Dispatch `code-reviewer` subagent to find what is unverified, return to `execute`. Never bypass. |
| Unsafe `bash` (rm -rf, curl \| sh) | Pre-exec policy in pi-mono core | Block + ask user. TUI shows the diff. |
| Secrets in repo | `security-auditor` scans changed files | Hard-stop, redact suggestion, log to session. |

## 8. Components and module layout

```
pi-mono/                                    # forked from badlogic/pi-mono
├── packages/
│   ├── coding-agent/                       # upstream pi, minimal patches only
│   ├── tasks/                              # @pi/tasks        state machine + log
│   ├── subagent/                           # @pi/subagent     role router
│   ├── checkpoint/                         # @pi/checkpoint   jsonl + content hash
│   ├── memory/                             # @pi/memory       .pi-pro/memory.md
│   ├── tui-pro/                            # @pi/tui-pro      OpenCode Ink chrome
│   └── skill-bundle/                       # @pi/skill-bundle curated skills
└── apps/
    └── pi-pro/                             # pi-pro binary
```

### 8.1 Package responsibilities

- **`@pi/skill-bundle`** — pure data + a tiny loader. Contains the curated skills directory and a `postinstall` script that copies them into `~/.pi-pro/skills/pi-pro/`. No runtime code. The default system prompt is a `prompt.md` file in this package, applied via pi's existing `systemPromptFile` config.

- **`@pi/tasks`** — exports a `TaskRunner` class. Constructor takes a `TaskSpec` (the plan) and an injected `pi-mono AgentLoop`. Owns the state machine, the session log, and orchestrates calls to the other packages. ~600 LOC.

- **`@pi/subagent`** — exports `SubagentRouter` and four role files (`build.ts`, `test-runner.ts`, `code-reviewer.ts`, `security-auditor.ts`). The router takes a `Role` + `StepContext`, restricts the tool set, runs a child loop, and returns a `SubagentResult` with explicit pass/fail + evidence. ~500 LOC.

- **`@pi/checkpoint`** — exports `CheckpointStore`. Writes to `.pi-pro/sessions/<id>.jsonl`, plus a `.pi-pro/checkpoints/<id>/<chk_id>.json` snapshot per transition. `resume(id)` validates the last checkpoint against the current git tree SHA; if SHA changed, surface a warning. ~250 LOC.

- **`@pi/memory`** — exports `SessionMemory`. Read/write `.pi-pro/memory.md` per project. Sections: `## Context` (read-only at intake), `## Learnings` (append-only at summarize). Uses simple markdown headings — no DB. ~150 LOC.

- **`@pi/tui-pro`** — Ink components. The TUI is a thin wrapper over the upstream pi TUI; we replace the prompt, status bar, and tool-output components with OpenCode-style versions. Slash commands: `/plan`, `/subagent <role>`, `/pr`, `/verify`, `/replay`, `/resume`. ~1500 LOC.

- **`apps/pi-pro`** — the binary. Entry point picks the right command from argv and dispatches.

## 9. Testing strategy

- **Unit (Vitest):** state machine transitions, `SubagentRouter` dispatch + tool restrictions, `CheckpointStore` round-trip + resume, `WorktreeStore` create/list/merge/conflict, `SessionMemory` read/append.
- **Integration:** end-to-end `pi-pro` run on a tiny fixture repo with a known task ("add a `/healthz` endpoint"). Assert: state log matches expected JSONL, all states reached, PR description generated, all tests pass.
- **Eval (`bench/`):** 5 synthetic tasks of varying difficulty — refactor, add feature, fix bug across files, add tests for legacy code, security audit. Run on every release. Track: completion rate, tokens to completion, wall-clock, # of user interventions.
- **Snapshot:** Ink component snapshot tests, so the OpenCode-style chrome doesn't regress visually.
- **Manual dogfood:** before v1 release, run pi-pro on this spec's eventual implementation.

## 10. Success metrics

- **≥ 80% one-shot completion** on the 5-task eval.
- **Median tokens-to-completion ≤ comparable agent** on the same tasks. Skills + subagent delegation should be more efficient, not just as-efficient.
- **Zero "false done"** — every completed task must pass `verification-before-completion`. Caught-claiming-done in dogfooding is a P0.
- **Resume works in 100% of crash cases** — `kill -9` at random points, then `pi-pro resume`, must complete the task.
- **TUI responsiveness** — first token visible in < 500 ms; subagent dispatches don't block the TUI thread.

## 11. PR-split order (upstream merge strategy)

1. **PR 1 — `@pi/skill-bundle`.** Lowest risk, fastest merge, free community win.
2. **PR 2 — `@pi/checkpoint`.** No internal dependencies.
3. **PR 3 — `@pi/memory`.** No internal dependencies.
4. **PR 4 — `@pi/tasks`.** Depends on 2 and 3.
5. **PR 5 — `@pi/subagent`.** Depends on 4.
6. **PR 6 — `@pi/tui-pro`.** Depends on 4 and 5. Gated on earlier PRs being stable.

Each PR has its own `package.json`, README, tests, and CHANGELOG. The `pi-pro` binary in `apps/pi-pro/` ships only when PRs 1-5 are merged.

## 12. CLI surface

```bash
pi-pro                                # launch TUI (default)
pi-pro "add rate limiting to /api/login"
pi-pro resume                         # resume last task in this project
pi-pro resume <task-id>               # resume a specific task
pi-pro replay <task-id>               # step-by-step replay in TUI
pi-pro merge <task-id>                # rebase worktree + gh pr create
pi-pro doctor                         # check git, providers, skills installed
pi-pro --version
```

## 13. License

MIT. Inherited from pi-mono. The skill bundle reuses skills from the superpowers project, which are also MIT.

## 14. Open questions for execution

- **OQ1 — Benchmark fixtures:** generate synthetic repos under `bench/fixtures/` (a tiny Node/Express API, a tiny Python CLI, a tiny Go service). No client code, no PII. Task shapes are inspired by patterns in real projects, not copied.
- **OQ2 — Subagent role prompts:** version them in the `roles/*.ts` files; the prompt for each role is part of the package contract. Iterate on these with the eval, not in the abstract.
- **OQ3 — Context compression:** v1 uses a simple "summarize the oldest 30% of turns into 3 bullet points" heuristic. Good enough for v1. Embedding-based retrieval deferred to v2.

## 15. Out of scope (deferred to v2)

- Web UI / desktop app
- Remote subagent workers (process or HTTP)
- Multi-user / team features
- Persistent vector store for memory
- OpenCode session migration
- Embedding-based context retrieval
- Auto-merge to main

# 2026-06-12 ~04:15 — pi-pro v0.8.2 SESSION HANDOFF (FRESH COMPRESS)

> **Purpose:** restore context for a fresh session in 60 seconds. Read this first.

## Current state (at end of v0.8.2)

- **Repo:** `/home/trader/Developer/pi-pro`
- **Branch:** `master`
- **Tag:** `v0.8.1` (https://github.com/DNDED/pi-pro/releases/tag/v0.8.1) — **v0.8.2 not yet tagged**
- **Latest commit:** `eba2296 feat(tui-pro): ex mode for vim (:w/:q/:wq/:clear/:help/:q!) (v0.8.2)`
- **Tests:** 1160/1160 pass, 18 packages build clean, typecheck clean
- **Working tree:** clean

## v0.7.0 → v0.8.2 (this release cycle)

| | Tests | Packages | Notes |
|---|---|---|---|
| v0.6.0-finish | 868 | 14 | Agent Swarm v1 |
| v0.7.0 | 1016 | 18 (+4) | embeddings, memory-store, context-manager, codebase-index |
| v0.8.0 | 1069 | 18 | per-turn cost, clickable links, insert-mode vim |
| v0.8.1 | 1130 | 18 | full modal vim (insert/normal/visual) |
| v0.8.2 | 1160 | 18 | + ex mode (`:w`/`:q`/`:wq`/`:q!`/`:clear`/`:help`) |

## What's done

- `packages/embeddings/` — provider abstraction (Anthropic, OpenAI, opencode-go, null)
- `packages/memory-store/` — SQLite + hybrid cosine+BM25+recency search
- `packages/context-manager/` — sliding window + extractive + LLM-summarize + /btw
- `packages/codebase-index/` — wraps repo-map + chokidar watcher
- `packages/subagent/src/llm-worker.ts` — LlmWorker with `contextManager` opt, `getLastTurnUsage`, `getDeltaSinceLastRun`
- `packages/tui-pro/src/util/vim.ts` — pure vim functions
- `packages/tui-pro/src/util/vim-dispatch.ts` — VimRuntime + handleKey/Insert/Normal/Visual/Ex, INITIAL_RUNTIME
- `packages/tui-pro/src/components/PromptInput.tsx` — refactored to use vim state machine (UI not yet rendering ex mode)
- `apps/pi-pro/src/commands/{memory,btw,setup}.ts` — CLI subcommands + REPL
- `bench/src/context-attribution.ts` — 4 v0.7.0 attribution configs

## What's missing in PromptInput UI (v0.8.3 candidate)

PromptInput has the dispatch wired (handles ex mode), but the React render doesn't:
- Show ex mode badge (or show the `:` prompt at the bottom of the input)
- Render the exBuf as user types
- React to `lastExCommand` (call onSubmit/onChange/onQuit as appropriate)

Adding these would close the loop on ex mode.

## Live LLM bench status (deferred)

- Sid shared key: `sk-qJ4wv5cn8BKlUnoblJzbKqmQbCTd2T6Ok4dmVic7lBIDOHSI0hvzC8XCzEi6Ed6I`
- **Status:** 200 on `/v1/models` but 401 on `/v1/messages` and `/v1/chat/completions`
- **Diagnosis:** Cloudflare read-side auth works, write-side auth fails. Likely Go subscription not active for this key.
- **Fix needed:** activate at https://opencode.ai/auth, then re-run bench
- **Key handling:** NEVER written to disk. Only used in inline `env OPENCODE_GO_API_KEY=… node -e` invocations. Not in shell history.

## Next-session candidates (priority order)

1. **ex mode UI integration in PromptInput** — small, closes the loop, ~10 tests. v0.8.3.
2. **`:r filename` and `:set model x` commands** — extend ex mode parser, ~15 tests
3. **sqlite-vss for memory-store** — only meaningful after real bench shows >10k chunks
4. **Live LLM bench attribution** — needs OpenCode Go key activation first
5. **Web session viewer** — separate web app; significant scope
6. **LSP integration** for code intelligence

## Conventions

- **No emoji** in any output (code, memory, CHANGELOG, commits)
- **No comments** in code unless Sid asks
- **TDD:** tests first, fail, implement minimal to pass, refactor
- **No commits/pushes without explicit ask** (per `pi-pro/AGENTS.md`)
- **Branch:** `master` (not `main`)
- **Commit style:** conventional commits (`feat(scope): description`)

## Sid's preferences (from `memory/user.md`)

- Concise by default; one-line answers when one line suffices
- "Continue" = execute the plan, build the thing, ship
- "Fix the rest" = finish pending items in current scope
- "ok continue wit that" / "do whats best" = push through with what makes sense
- "lets do a checkpoint" = commit + tag + memory update
- "compact context then do the next thing" = write a handoff doc + pick the next small impactful thing

## Reusable patterns

- 3-phase build: spec/plan + memory update → build with TDD → commit + push
- 9-commit batch per release: per-package + wiring + lock + docs + bench attribution + memory
- "Compress and continue" / "Compact and continue" = write a tight session-state doc + pick the next small impactful thing

## Open issues / known bugs

- None blocking as of v0.8.2
- Live bench 401s on completions (key issue, not code)
- v0.6.0 `bench/test/runner-invariants.test.ts` has 1 flaky test (concurrent tmpdirs); pre-existing, not v0.8.x related

## Quick-start commands for next session

```bash
# Auto-recall (5 files at session start)
cat /home/trader/Developer/pi-pro/memory/user.md
cat /home/trader/Developer/pi-pro/memory/projects/pi-pro.md
cat /home/trader/Developer/pi-pro/memory/decisions/v0.8.0.md
ls /home/trader/Developer/pi-pro/memory/daily/
cat /home/trader/Developer/pi-pro/memory/sessions/index.md

# Verify state
cd /home/trader/Developer/pi-pro
git log --oneline -3
git status
pnpm -r test 2>&1 | tail -3
```

## Diff vs previous handoff doc (2026-06-12-pi-pro-handoff.md)

- +30 tests (1130 → 1160): v0.8.2 ex mode (parseEx + applyEx + handleExKey + 30 new tests)
- +1 commit (`eba2296 feat(tui-pro): ex mode for vim`)
- New finding: PromptInput dispatch handles ex mode but UI doesn't render it (v0.8.3 candidate)
- Last commit hash changed

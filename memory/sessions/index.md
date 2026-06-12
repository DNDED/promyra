# OpenCode Sessions — Index

Per-task session logs for OpenCode (this agent). 3-10 entries/day expected. Skip for single Q&A turns.

**Format:** `memory/sessions/YYYY-MM-DD-<short-id>.md`. Each row links to the per-session detail file.

**Per-session file shape:**
- Trigger (what Sid said)
- Files touched
- Decisions
- Outcome / verification
- Vault links (wikilinks)

**Search:** `grep -i <keyword> "memory/sessions/index.md"` for fast skim, or `ls memory/sessions/*.md` for the full list.

## Recent

| Date | Session ID | Topic | Files | Decisions | Detail |
|---|---|---|---|---|---|
| 2026-06-11 | `pi-pro-v050-build` | pi-pro v0.5.0 build (initial) — research swarm, brainstorm, spec, plan, packages/cache + packages/optimizer + provider extensions + LLM worker wiring | 14 files in `packages/{cache,optimizer}/`, `packages/provider/src/{types,anthropic,openai-compat,opencode-go}.ts`, `packages/subagent/src/{llm-worker,router}.ts`, `docs/superpowers/{specs,plans}/2026-06-11-pi-pro-v0.5.0-*.md` | cost math fix (cache writes replace input, not additive); cascade is for subagent model pinning, not tool dispatch; tool cache auto-detects file paths | [[2026-06-11-pi-pro-v050-build]] |
| 2026-06-11 | `pi-pro-v050-finish` | pi-pro v0.5.0 finish-the-rest — repo-map, TUI cost display, bench attribution, PROMYRA_* env flags | `packages/{repo-map,tui-pro/src/cost-display.ts,bench/src/attribution.ts,apps/pi/src/flags.ts}` (12 new files) + 8 pre-existing typecheck fixes | repo-map = regex (not tree-sitter) for zero native dep; 6 flag configs for full cross-coverage; env flag default ON | [[2026-06-11-pi-pro-v050-finish]] |
| 2026-06-11 | `pi-pro-v060-design` | pi-pro v0.6.0 design + memory migration | `memory/` (12 files), `pi-pro/AGENTS.md`, `docs/superpowers/{specs,plans}/2026-06-11-pi-pro-v0.6.0-*.md` | new `packages/swarm` (orchestrator + 5 subagents + scratchpad + verification + budget); file scratchpad over message bus; 3 parallel stages max; Multica preserved as direct dispatch; in-repo memory at `pi-pro/memory/` | [[2026-06-11-pi-pro-v060-design]] |
| 2026-06-11 | `pi-pro-v060-build` | pi-pro v0.6.0 build (initial) — packages/swarm with 9 modules | `packages/swarm/{src,test}/*.ts` (12 new files), `CHANGELOG.md`, `memory/{projects/pi-pro,daily/2026-06-11,sessions/index}.md` | scratchpad atomic write with unique tmp; budget `getState()` (not `state()`); explicit `load()`; git merge needs `checkout main` first + 3-dot diff before merge; **851/851 tests pass** (was 749; +102 swarm) | [[2026-06-11-pi-pro-v060-build]] |
| 2026-06-11 | `pi-pro-v060-finish` | v0.6.0 finish + GitHub push — TUI SwarmPanel + CLI flags + 6 commits | `packages/tui-pro/src/components/SwarmPanel.tsx`, `apps/pi/src/commands/swarm.ts`, `apps/pi/src/cli.ts`, `apps/pi-pro/src/commands/setup.ts`, package.json deps | TUI live swarm status with budget colors; SubagentDispatcher bridges LlmWorker → orchestrator; new `--plan --budget --max-retries --dry-run --continue --status --merge --list` flags; 6 commits to `master`; pushed to `DNDED/pi-pro`; **868/868 tests pass** | [[2026-06-11-pi-pro-v060-build#2026-06-11-0055]] |
| 2026-06-11 | `pi-pro-v070-design` | v0.7.0 brainstorm + project rename (promyra → pi-pro) | bulk `sed @promyra/ → @pi/` and `promyra → pi-pro`; `git mv apps/promyra → apps/pi-pro`; GitHub repo rename via `PATCH /repos/{owner}/{repo}`; `docs/superpowers/{specs,plans}/2026-06-11-pi-pro-v0.7.0-*.md`; `memory/decisions/v0.7.0.md`; `memory/projects/{promyra→pi-pro}.md` rename | **Ambitious scope**: sliding window + extractive + LLM-summarize + cross-session memory + codebase index + /btw + auto-summarization; provider-API embeddings (Anthropic Voyage, OpenAI text-embedding-3-small, opencode-go, NullEmbeddings BM25); global SQLite + per-project markdown; hybrid compression; both regex + embeddings codebase index; adaptive triggers (token 75/90%, turn-20, cost-cap); /btw side channel; ContextBudget TUI; **`pi-proPath` → `piProPath` fix** (TS parsed `pi-proPath` as `pi - proPath`); **774/774 tests pass** (was 868; -94 from deleted `apps/promyra/` duplicates) | [[2026-06-11-pi-pro-v070-design]] |

## How this maps to broader memory
- Per-session detail files include vault wikilinks back to `projects/`, `daily/`, `decisions/`, `user.md`.
- Decisions go to `decisions/v0.X.md` per release.
- Project state goes to `projects/pi-pro.md`.
- Daily narrative goes to `daily/YYYY-MM-DD.md`.
- Cross-project session index (Hermes, etc.) lives in user's Obsidian vault at `Sessions/Index.md`.

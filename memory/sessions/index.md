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
| 2026-06-11 | `pi-pro-v070-build` | **v0.7.0 Memory at Scale COMPLETE** — 4 new packages + TUI + CLI + bench | 4 new packages: `embeddings` (28), `memory-store` (54), `context-manager` (47), `codebase-index` (26); LlmWorker wiring (subagent 120→127); TUI ContextBudget+BtwPrompt+ContextBreakdown (tui-pro 95→132); CLI `pi memory`/`pi btw`/`pi context` + REPL `/memory-*`/`/btw`/`/context` + v0.7.0 env flags (apps/pi-pro 91→111); bench context-attribution + long-task-50turn fixture (bench 42→65); 8 atomic commits pushed to DNDED/pi-pro; **1016/1016 tests pass** (+148); **18 packages build clean**; live LLM bench deferred (no API key in env); projected numbers in `formatContextAttribution` from spec §3 | [[2026-06-11-pi-pro-v070-build]] |
| 2026-06-11 | `pi-pro-v080-build` | **v0.8.0 UX Differentiation COMPLETE** — per-turn cost + clickable links + vim motions | Footer `turnDelta` prop + `LlmWorker.getLastTurnUsage/getDeltaSinceLastRun` (+16 tests); `parseLinks` util + StreamingText cyan+underline rendering of HTTP/file:///file:line refs (+17 tests); PromptInput cursor + vim-style insert-mode bindings (h/l, w/b/e, 0/$, Ctrl+W/U/A/E, Esc) + inverse cursor + hint footer (+20 tests); 3 atomic commits pushed; **1069/1069 tests pass** (+53); **18 packages build clean**; live LLM bench still deferred (OpenCode Go key 401s on `/v1/messages` — needs dashboard activation at opencode.ai/auth) | [[2026-06-11-pi-pro-v080-build]] |
| 2026-06-12 | `pi-pro-v081-build` | **v0.8.1 Modal Vim (CHECKPOINT)** — full modal vim in PromptInput | New `util/vim.ts` (VimState/VimMode/OpKind/pure functions) + `util/vim-dispatch.ts` (VimRuntime/handleKey dispatch) + 61 new tests; PromptInput refactored to use vim state machine; mode badge + pending operator badge + hint footer; insert/normal/visual modes; motions h/l/w/b/e/0/$/j/k; operators d/c/y with motions; line ops dd/cc/yy; count prefix 3w/3dd; paste p/P (char + line-wise); undo (in-memory stack); visual mode v/V + d/y/c; 8 bugs hit + fixed (wordEnd, applyLineChange, pushUndo ordering, setCursor anchor); single commit pushed; **1130/1130 tests pass** (+61); **18 packages build clean** | [[2026-06-12-pi-pro-v081-build]] |

## How this maps to broader memory
- Per-session detail files include vault wikilinks back to `projects/`, `daily/`, `decisions/`, `user.md`.
- Decisions go to `decisions/v0.X.md` per release.
- Project state goes to `projects/pi-pro.md`.
- Daily narrative goes to `daily/YYYY-MM-DD.md`.
- Cross-project session index (Hermes, etc.) lives in user's Obsidian vault at `Sessions/Index.md`.

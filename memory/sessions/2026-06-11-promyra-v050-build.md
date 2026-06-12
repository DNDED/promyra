# 2026-06-11 ~22:00 — pi-pro v0.5.0 build (initial)

**Trigger:** Sid: "I want to make an improved pi agent like the pi agent should be performing better than claude code and opencode with the same model ... do research brainstorm a bunch use an agent swarm for help"

**Phase 1 — Research swarm (5 parallel subagents via Task tool):**
- existing pi ecosystem (pi-mono, oh-my-pi, pi_agent_rust, the multica, earendil-works/pi)
- Claude Code architecture (from anthropic-news, symmetrybreak.ing, hackernews, the source-leak thread)
- OpenCode architecture (anomalyco/opencode on github — 173k stars, 75+ providers, subagents, plugins)
- swarm architectures (Anthropic Building Effective Agents, Magentic-One, mini-SWE-agent SWE-bench, langgraph)
- token optimization (Anthropic prompt caching, LLMLingua, FrugalGPT, repo-map, cascade routing)

**Phase 2 — Brainstorm (decomposition-first):**
- Scope = Decompose first, brainstorm one release (Sid's pick of 4)
- Release = v0.5.0 Token/Cost Foundation
- Cost target = 2x conservative (Sid's pick: 50% of v0.4.0)
- Quality = parity with 5% variance (Sid's pick: Recommended)
- Wall = 40% faster (~18s) (Sid's pick: Recommended)
- Approach = A+repo-map-block+light cascade (Sid's pick: Recommended)

**Phase 3 — Spec + plan written (this turn):**
- `docs/superpowers/specs/2026-06-11-pi-pro-v0.5.0-design.md` (213 lines)
- `docs/superpowers/plans/2026-06-11-pi-pro-v0.5.0.md` (294 lines)

**Phase 4 — Build (TDD-first, 2 subagents dispatched for parallel work):**
- `packages/cache` (NEW, 20 tests) — `PromptCache` + `ToolResultCache`
- `packages/optimizer` (NEW, 40 tests) — `optimize()` + cascade router + pricing
- Provider types extended: `CallOpts.cacheHints`, `Usage.{cacheReadTokens, cacheWriteTokens, costUsd?}`, `TextBlock.cache_control?`
- All 3 providers emit cache hints + read back cache token counts
- `LlmWorker` (subagent) wraps every LLM call with `optimizer.optimize()`, parallel tool execution, tool result cache integration
- `SubagentRouter` constructs and wires `Optimizer` + `ToolResultCache`
- 8 new integration tests in subagent

**Decisions (rationale captured in spec):**
- Cost math: cache writes REPLACE input tokens at 1.25x, not additive (fixed during TDD when test failed)
- Tool calls execute locally; cascade is for subagent model pinning, not tool dispatch
- Tool cache auto-detects file paths in args (path, file_path, file)
- Optimizer wraps but doesn't break on throw (fallback to raw LLM call)

**Outcome:**
- 703 / 703 tests passing (was 635 in v0.4.0; +68 new)
- `pnpm -r typecheck` clean
- All 14 packages build clean
- CHANGELOG v0.5.0 entry written

**Not committed** (per AGENTS.md "no commits without explicit ask").

**Vault links (this turn):** [[../projects/pi-pro]] (created in Obsidian), [[../../../Daily/2026-06-11]] Phase 1.

# 2026-06-11 ~23:55 — pi-pro v0.6.0 design + memory migration

**Trigger:** Sid: "ok whats next" (after v0.5.0 was shipped but uncommitted), then "v0.6.0 Agent Swarm v1 (the next roadmap release)" (Sid's pick from 4 options).

**Phase A — v0.6.0 brainstorm (6 questions, all Recommended options picked by Sid):**
1. Scope: **Full swarm** (orchestrator + planner + builder + critic + test-runner + researcher + worktrees + verification + cost caps + retry) — not Minimal, not Spike-first.
2. Autonomy: **Fully autonomous, plan on demand** — `pi swarm` runs; `--plan` shows plan first.
3. Worktrees: **Per-role worktrees, isolated writes** — builder + test-runner get git worktrees; planner/researcher/critic read cwd.
4. Failure: **Retry-with-feedback, default 2 retries, then escalate** — reuses v0.4.0 `retryFeedback` pattern.
5. Cost cap: **Soft warn at 50%, hard kill at 100%, $2.00 default** — `--budget=<usd>` overrides.
6. Model routing: **Both** — per-subagent model pinning (cheap for read-only, main for builder) AND per-tool cascade inside each subagent (v0.5.0 cascade map applied universally).

**Phase B — Spec approved (in this conversation, design above IS the spec):**
- 11 sections: architecture, components, communication, topology, worktrees, cost cap, failure handling, model routing, CLI surface, TUI surface, error handling, testing, out-of-scope, risks, rollout, verification.
- File-based scratchpad at `.pi-pro/swarm/<id>/` (durable, diffable, survives restarts).
- 3-stage parallel-friendly topology: PLAN → RESEARCH+PLANNER (parallel) → BUILD → TEST → CRITIQUE → DECIDE → MERGE.
- 5 subagents + 1 orchestrator. Multica preserved as one-shot direct dispatch (bypasses orchestrator).
- New `packages/swarm` package (orchestrator, scratchpad, worktree-pool, verification-gate, budget, types).
- New `<SwarmPanel>` TUI component.

**Phase C — Memory migration (this turn):**
- **Trigger:** Sid: "change the memory to go to pi pro create it if u have to and all the shit we did this session"
- **Migration:** Memory moved from `/home/trader/Documents/Obsidian Vault/` (per-AGENTS.md default) → `/home/trader/Developer/pi-pro/memory/` (in-repo, project-scoped).
- **Files created in `pi-pro/memory/`:**
  - `README.md` (overview of in-repo memory)
  - `projects/pi-pro.md` (project note, extended with v0.6.0)
  - `daily/2026-06-11.md` (full day narrative: v0.5.0 build + v0.5.0-finish + v0.6.0 design + memory migration)
  - `sessions/2026-06-11-pi-pro-v050-build.md`
  - `sessions/2026-06-11-pi-pro-v050-finish.md`
  - `sessions/2026-06-11-pi-pro-v060-design.md` (this file)
  - `sessions/index.md`
  - `decisions/v0.5.0.md`
  - `decisions/v0.6.0.md`
  - `user.md` (Sid preferences extracted)
  - `AGENTS-rules.md` (auto-recall + auto-store + session-end checklist)
- **Plus `pi-pro/AGENTS.md` at repo root** pointing at all of the above with HARD GATEs.
- **Why:** Sid wants memory tied to the repo, not global Obsidian. Obsidian vault preserved for other projects (leadops, argent, etc.).

**Decisions (memory):**
- In-repo memory at `pi-pro/memory/` (not `docs/memory/` or `.pi-pro/memory/`) for clean git tracking.
- Same structure as Obsidian: `projects/`, `daily/`, `sessions/`, `decisions/` (renamed from `Memory/Decision Log.md` per-v0.5.0 + per-v0.6.0 for cleaner per-release).
- Sid's 5-file auto-recall (from global AGENTS.md) now reads from in-repo when working in pi-pro.

**Decisions (v0.6.0 — recorded separately in `decisions/v0.6.0.md`):**
- New `packages/swarm` package, not a subagent module — swarm has too much surface area.
- File scratchpad, not message bus (research-backed: durable, diffable, survives restarts).
- 3 parallel stages max (researcher + planner parallel; build → test → critique sequential).
- Multica bypasses orchestrator (preserved direct dispatch for single-role fast path).

**Outcome / verification:**
- v0.6.0 design approved.
- Memory migration complete: in-repo, all 3 sessions captured, project note + decisions updated.
- v0.6.0 spec + plan files to be written this turn.
- v0.6.0 build begins with `packages/swarm` skeleton (this turn).

**Vault links:** [[../projects/pi-pro]] (extended), [[../../../Daily/2026-06-11]] Phase 3 + 4.

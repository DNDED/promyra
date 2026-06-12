# AGENTS Rules — in-repo memory for pi-pro

These are the **HARD GATEs** (fail-closed) for working in the pi-pro repo. They mirror the global `~/.config/opencode/AGENTS.md` rules but target the in-repo `memory/` instead of the Obsidian vault.

---

## 1. Memory Auto-Recall (at session start)

Before the first response, read these 5 files in order:

1. `memory/user.md` — Sid's preferences, comm style, UI taste, anti-patterns.
2. `memory/projects/pi-pro.md` — project state, releases, architecture, files of interest.
3. `memory/decisions/v0.6.0.md` — last release decisions (and `v0.5.0.md` for older).
4. `memory/daily/2026-06-11.md` — today's narrative so far (or the most recent daily).
5. `memory/sessions/index.md` — last 3 OpenCode sessions (skim the latest detail files).

If a project name is mentioned or a path is rooted in a known project (e.g. `packages/swarm/`), read `memory/projects/pi-pro.md` first.

---

## 2. Memory Auto-Store (per turn, as facts emerge)

Do NOT wait for Sid to ask. Write durable facts as they happen:

- **Durable fact learned** (preference, project state, decision, reusable lesson) → write to canonical location immediately.
  - User/preference → `memory/user.md`
  - OpenCode behavior/setup → `memory/AGENTS-rules.md` (this file)
  - Project knowledge → `memory/projects/pi-pro.md` (and update `memory/sessions/index.md` if new)
  - Decision that constrains future work → `memory/decisions/v0.X.md`
  - Narrative or one-off → `memory/daily/YYYY-MM-DD.md`
- **One source of truth.** Don't write the same fact in two places. Wikilink from the second location to the first.
- **Don't write:** secrets, API keys, env values, one-off task progress ("I just ran `ls`"), stale PR/commit numbers, temporary logs, duplicates.

---

## 3. Session End Checklist (before final reply of any task)

Walk the 5-step gate:

1. Did I touch the project? → update `memory/projects/pi-pro.md` if state changed.
2. Did I make a decision that constrains future work? → append to `memory/decisions/v0.X.md`.
3. Did I learn a preference about Sid? → append to `memory/user.md`.
4. Did anything happen today? → ensure `memory/daily/YYYY-MM-DD.md` has the entry.
5. Did I do meaningful task work? → write `memory/sessions/<id>.md` + add row to `memory/sessions/index.md`.

Skip steps without reason. Do not skip with reason.

---

## 4. Project Auto-Detection

When the working directory or file paths reference `/home/trader/Developer/pi-pro`, auto-load `memory/projects/pi-pro.md` BEFORE any code changes. Do not start editing, do not propose architecture, do not even read project files until the project note is loaded.

---

## 5. Brainstorming Gate

Any of these triggers a brainstorming skill invocation BEFORE implementation:

- New feature, new component, new page, new section
- Behavior change to an existing surface
- "Make it better", "redesign", "rebuild", "rework", "improve" with no concrete spec
- New design system, new tokens, new visual direction
- A "creative" prompt that has more than one valid answer

Skipping brainstorming here is a failure mode. Brainstorm → spec → build. Tuning a known thing, fixing a known bug, and pure Q&A do not trigger the gate.

---

## 6. TDD Gate

For any non-trivial implementation, write tests FIRST. Then implement minimal code to pass. Then refactor. Per the `test-driven-development` skill.

---

## 7. Conciseness Gate

Per `~/.config/opencode/skills/sid-caveman-responses/SKILL.md` and `sid-concise-completions/SKILL.md`:

- One-line answers when one line suffices.
- No preamble, no postamble, no filler.
- No emojis.

---

## 8. No-Commit Gate

Per `~/.config/opencode/AGENTS.md`:

- No commits, pushes, or PRs without explicit ask.
- "ok build" or "ok continue build" = execute, not commit.
- Sid commits manually.

---

## How this differs from the global AGENTS.md

| Rule | Global | In-repo (this file) |
|---|---|---|
| Memory location | `/home/trader/Documents/Obsidian Vault/` (Obsidian) | `memory/` (in pi-pro) |
| Projects | All (leadops, argent, etc.) | pi-pro only |
| Project note | `Projects/<name>.md` | `memory/projects/pi-pro.md` |
| Daily log | `Daily/YYYY-MM-DD.md` | `memory/daily/YYYY-MM-DD.md` |
| Sessions | `Sessions/OpenCode/` | `memory/sessions/` |
| Decisions | `Memory/Decision Log.md` | `memory/decisions/v0.X.md` |

The Obsidian vault remains in use for other projects (leadops, argent, fencing-pipeline, multica, etc.). When working in pi-pro, prefer in-repo. When working in other projects, prefer Obsidian.

# AGENTS.md — pi-pro

Loaded by OpenCode when working in `/home/trader/Developer/pi-pro`. Overrides global `~/.config/opencode/AGENTS.md` for this project.

## Project

- **Name:** pi-pro
- **Type:** pi-mono extension (TypeScript)
- **Owner:** Sid (DNDED on GitHub)
- **Repo:** `/home/trader/Developer/pi-pro`
- **Runtime install:** `pi install ./packages/pi-pro-ext` (registered in `~/.pi/agent/settings.json`)
- **See:** `memory/projects/pi-pro.md` for state; `memory/decisions/` for durable decisions

## Architecture (v0.1.0)

```
pi-mono v0.79.x (oficial @earendil-works/pi-coding-agent)
  └─ pi CLI (npm-global bin, installed via curl https://pi.dev/install.sh)
       └─ ~/.pi/agent/extensions/pi-pro-ext/   ← this project's extension
            └─ packages/pi-pro-ext/index.ts      ExtensionAPI wiring (jiti-loadable)
                 └─ uses @pi-pro/config           PiConfig schema, load/save
```

## Memory (in-repo, not Obsidian)

- `memory/user.md` — Sid's preferences + durable facts about him
- `memory/projects/pi-pro.md` — current state, releases, architecture
- `memory/decisions/v*.md` — per-release decision log
- `memory/daily/YYYY-MM-DD.md` — narrative
- `memory/sessions/...` — task logs (compact on end-of-task)

## Workflow gates (HARD)

1. **Memory auto-recall** — read 5 files at session start
2. **Memory auto-store** — write durable facts immediately
3. **Session end checklist** — 5 steps before final reply
4. **Project auto-detect** — load `memory/projects/pi-pro.md` first
5. **Brainstorming** — for new features, brainstorm first
6. **TDD** — tests first
7. **Conciseness** — no preamble, no emojis
8. **No-commit** — no commits without explicit ask

## Stack

- TypeScript + Node 20+
- pnpm workspaces
- vitest for tests
- The extension file is `.ts` (jiti-loadable, no compile needed)
- Internal `@pi-pro/config` is the only workspace package

## Commands

- `pi --version` → 0.79.1
- `pi` → REPL with extension loaded
- `pi list` → see installed packages
- `pi install ./packages/pi-pro-ext` → reinstall the extension
- `pi remove ./packages/pi-pro-ext` → uninstall
- `pnpm -r test/typecheck/build` → monorepo CI

## Env (no special flags)

- `PI_HOME_OVERRIDE` — override `~/.pi/` for testing
- `XDG_CONFIG_HOME` — override config dir (XDG-aware)
- `OPENCODE_GO_API_KEY` (or other provider vars) — for live LLM access

## Live LLM bench

Blocked: Go subscription not active at opencode.ai/auth. Will resume when activated.

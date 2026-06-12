---
type: session
date: 2026-06-12
title: pi-pro v0.1.0 — hard wipe + clean reinstall
status: completed
---

# v0.1.0 Reinstall Session

**Date:** 2026-06-12
**Outcome:** Hard wipe + fresh pi-mono install + minimal monorepo with single-file extension.

## Sequence

### Phase 1: Wipe (8 commands)
- `mv /home/trader/Developer/pi-pro /home/trader/Developer/pi-pro.bak-${TS}` — backup
- `rm -f /home/trader/.local/bin/pi ~/.local/bin/promyra` — symlinks
- `rm -rf /home/trader/.pi` — pi-mono state
- `npm uninstall -g @earendil-works/pi-coding-agent` — npm install
- `rm -f ~/.npm-global/bin/pi` — bin symlink
- `sed` edits to `~/.bashrc` (removed our line 137 PATH prepend + promyra alias + duplicate)

### Phase 2: Install official pi
- `curl -fsSL https://pi.dev/install.sh -o /tmp/pi-install.sh` (inspect first)
- `sh /tmp/pi-install.sh` — runs `npm install -g --ignore-scripts --min-release-age=0 @earendil-works/pi-coding-agent`
- Result: `pi` v0.79.1 at `~/.npm-global/bin/pi` (symlink to npm package)
- Bashrc got duplicate PATH export (one from installer, one leftover) — cleaned

### Phase 3: Re-init monorepo
- `mkdir pi-pro && cd pi-pro && git init -b master`
- `git config user.email/name`
- Created dirs: `packages/{pi-pro-ext,config}`, `memory/{decisions,daily,sessions}`

### Phase 4: Source files
- Root: `package.json` (private), `pnpm-workspace.yaml`, `.gitignore`
- `AGENTS.md` — project context, HARD GATEs
- `README.md` — install + architecture
- `memory/{user,projects/pi-pro}.md` — durable state
- `memory/daily/2026-06-12.md` — narrative

### Phase 5: Extension (next)
- `packages/pi-pro-ext/package.json` with `pi-package` keyword
- `packages/pi-pro-ext/index.ts` — ExtensionAPI wiring (config, modes, plan, todo, memory)
- `packages/config/src/...` — PiConfig Zod schema, load/save/validate/modes
- `pnpm install`
- `pi install ./packages/pi-pro-ext`
- Verify

### Phase 6: Commit + push
- `git add -A && git commit -m "init: pi-pro v0.1.0"`
- `git remote add origin git@github.com:DNDED/pi-pro.git`
- `git push -u origin master --force` (fresh history)

## Decisions captured

1. **Hard wipe, not soft reset** — Sid was explicit. The old 19-package sprawl is gone.
2. **Single-file extension** — jiti-loadable `.ts`, no compile step.
3. **Curl installer** — the documented Sid-recommended path. No npm flags, no PATH edits.
4. **Local path install** — `pi install ./packages/pi-pro-ext`. Sid picked this over npm publish.
5. **Minimal monorepo** — 2 packages, no swarm/embeddings/memory-store. Defer those until needed.
6. **No git history rewrite** — the old repo was renamed (`pi-pro.bak-${TS}`), fresh `git init` here. Old history not migrated.

## Risks mitigated

- Bashrc duplicate PATH → cleaned with `sed` + manual edit
- `pi` symlink conflict → no symlink needed; npm-global has it
- Extension peer dep resolution → `pi install` runs `npm install` in extension dir automatically
- Old artifacts in `~/.pi/` → wiped before fresh install

## Status

- 1321 tests in old monorepo: GONE (rebuild as features grow)
- 19 packages: GONE
- v0.8.4 history: GONE (clean slate)
- New state: 2 packages, ~50 tests (config), 1 extension file

## Pending (next steps)

1. Write `packages/config/src/*.ts` + tests
2. Write `packages/pi-pro-ext/index.ts` (extension)
3. `pnpm install` + `pi install ./packages/pi-pro-ext`
4. Verify with `pi list` + `pi --version` + test a command
5. Commit + push

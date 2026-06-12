# In-repo Memory — pi-pro

This directory is the durable memory for the **pi-pro** project (the TS fork of pi-mono that lives at `/home/trader/Developer/pi-pro`).

## Why in-repo

- **Single source of truth** — version-controlled with the project. No risk of drift between a global Obsidian vault and the project state.
- **Project-scoped** — when working in pi-pro, the agent auto-reads from here (per `pi-pro/AGENTS.md` + `~/.config/opencode/AGENTS.md`).
- **Discoverable** — anyone cloning the repo gets the memory with it.

## Structure

```
memory/
├── README.md                    # this file
├── AGENTS-rules.md              # auto-recall + auto-store + session-end checklist (HARD GATEs)
├── user.md                      # Sid's preferences (tone, workflow, tooling, memory rules)
├── projects/
│   └── pi-pro.md               # project note: architecture, releases, files of interest
├── daily/
│   └── YYYY-MM-DD.md            # one file per day; narrative per phase
├── sessions/
│   ├── index.md                 # sessions table (recent 3-10)
│   └── YYYY-MM-DD-<short-id>.md # per-task session log
└── decisions/
    ├── v0.5.0.md                # decisions for v0.5.0 Token/Cost Foundation
    ├── v0.6.0.md                # decisions for v0.6.0 Agent Swarm v1
    └── v0.7.0.md                # decisions for v0.7.0 Memory at Scale
```

## Auto-recall (5 files at session start)

Per `AGENTS-rules.md` §1, OpenCode reads these 5 in order before the first response:

1. `memory/user.md`
2. `memory/projects/pi-pro.md`
3. `memory/decisions/v0.7.0.md` (and `v0.6.0.md`, `v0.5.0.md`)
4. `memory/daily/YYYY-MM-DD.md` (today)
5. `memory/sessions/index.md` (last 3)

## Auto-store (per turn, as facts emerge)

Per `AGENTS-rules.md` §2, the agent writes durable facts immediately — no waiting for Sid to ask. One source of truth. Don't write secrets, env values, or one-off task progress.

## Session end checklist (5 steps)

Per `AGENTS-rules.md` §3, before the final reply of any task, walk the 5-step gate:
1. Touched project? → update `projects/pi-pro.md`
2. Decision constraining future work? → append to `decisions/v0.X.md`
3. Learned preference? → append to `user.md`
4. Anything happened today? → ensure `daily/YYYY-MM-DD.md` has the entry
5. Meaningful task work? → write `sessions/<id>.md` + add row to `sessions/index.md`

## Sync to Obsidian (optional)

The Obsidian vault at `/home/trader/Documents/Obsidian Vault/` is the global memory for other projects (leadops, argent, etc.). pi-pro is intentionally NOT in the Obsidian vault — it lives in-repo only. Sid can manually mirror if needed (e.g. for cross-project search), but there's no automated sync.

## Origin

This memory system was created on 2026-06-11 during the v0.6.0 design session. Before this date, pi-pro memory was stored in the Obsidian vault under `Projects/pi-pro.md`, `Daily/2026-06-11.md`, and `Sessions/OpenCode/`. Those entries are preserved in the vault for historical reference.

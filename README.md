# pi-pro

**Sid's improved coding agent** — ships as a [pi-mono](https://pi.dev/) extension, not a separate binary.

This monorepo is the **source** for the `pi-pro` extension. The runtime artifact lives in `packages/pi-pro-ext/` and is installed on top of the official `pi` via `pi install`.

## What pi-pro adds

Loaded automatically when you `pi install` this extension:

- **Agent mode cycle** — `:mode` (build ↔ plan) and the `Tab` shortcut to cycle
- **Plan mode** — read-only tool allowlist + DESTRUCTIVE_PATTERNS bash gate
- **Todo tool** — LLM-callable `todo` action: list/add/toggle/clear
- **Config** at `~/.pi/pi.json` — provider/agent/theme/ui/modes
- **Starship-style footer status** — cwd, branch, git status icons, runtime, mode badge
- **Memory commands** — `/btw`, `/context`, `/memory-add`, `/memory-search`, `/memory-list`, `/memory-forget`
- **REPL helpers** — `:mode`, `:plan`, `:todos`, `:config`, `:doctor`, `:ui`

## Install

### 1. Install official `pi`

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

### 2. Install the extension

```bash
git clone https://github.com/DNDED/pi-pro.git ~/Developer/pi-pro
cd ~/Developer/pi-pro
pnpm install
pi install ./packages/pi-pro-ext
```

That's it. Restart your terminal, type `pi`, and the v0.1.0 features are loaded.

## Architecture

```
pi-mono (upstream)                  Mario Zechner's official coding agent
└── pi CLI                          bin from npm-global, v0.79.x
     └── ~/.pi/agent/extensions/    auto-discovered
          ├── pi-coding-agent...    (built-ins)
          ├── ... (other extensions)
          └── pi-pro-ext/           ← OUR package
                └── index.ts        extension entry (jiti-loadable, no compile)

~/Developer/pi-pro/                this monorepo (source)
├── packages/
│   ├── pi-pro-ext/                the shipped extension
│   │   ├── package.json           pi-package manifest
│   │   └── index.ts               ExtensionAPI wiring
│   └── config/                    @pi-pro/config (PiConfig schema)
│       └── src/                   load/save/validate/cycle
├── memory/                         in-repo memory (durable facts)
└── README.md, AGENTS.md
```

**Why an extension, not a fork:** per Sid ("it should just be an extension of this pi agent"), pi-pro layers on top of upstream pi-mono. No competition, no duplication, no symlinks.

## Usage

```bash
pi                  # launch REPL
pi --version        # 0.79.1 (pi-mono)
pi list             # extension list
```

In REPL:
- `:mode` — show/cycle agent mode (build ↔ plan)
- `:plan` — toggle plan mode
- `:todos` — show todo list
- `:config` — show pi-pro config
- `:doctor` — system check
- Tab (in editor) — cycle agent mode

## Development

```bash
pnpm install                 # install workspace deps
pnpm -r test                # run all tests
pnpm -r typecheck           # typecheck
pnpm -r build               # build all packages
pi -e ./packages/pi-pro-ext --print "test"   # test extension for one run
pi install ./packages/pi-pro-ext             # reinstall
```

## State

- v0.1.0 (this commit) — clean reinstall. pi-mono v0.79.x + pi-pro extension
- v0.0.0 — old 19-package monorepo (wiped; see git history before re-init)

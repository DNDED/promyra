---
type: user
name: Sid
---

# Sid (DNDED on GitHub)

- Email: dnded123@gmail.com
- Machine: MERQURA-OC (Linux)
- Timezone: appears UTC (working across sessions)
- Works on: pi-pro (a fork/extension of pi-mono at pi.dev)
- Owns the project, drives the roadmap

## Communication preferences

- Short responses, no preamble, no emojis (per `~/.config/opencode/AGENTS.md`)
- Wants to see the result, not the process
- Calls out when things don't work as expected ("not whatever garbage")
- Trusts me to make small implementation decisions but asks on architecture pivots

## Style

- Terse, casual, lowercase, sometimes typos ("teh", "configruation")
- All lowercase in casual messages
- Iterates on a release-by-release basis (v0.5.0, v0.6.0, etc.)
- Reviews by running pi in the terminal

## Decisions (durable)

- pi-pro should be a pi-mono extension, not a separate binary ("it should just be an extension of this pi agent")
- Uses the oficial pi installer (curl https://pi.dev/install.sh)
- Per-release: spec → plan → 10 atomic commits → tag
- TDD discipline (tests first)
- Wants clean install flow (no symlinks, no PATH hacks)
- Live LLM bench deferred until Go subscription active
- Telegram adapter deferred to v0.9.0+ (Tailscale "ip" experience)

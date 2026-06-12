/**
 * pi-pro v0.1.0 — extension for pi-mono.
 *
 * Loaded automatically by `pi` when registered in ~/.pi/agent/settings.json.
 * Provides:
 *   - Agent mode cycle (build/plan) with Tab shortcut
 *   - Plan mode: DESTRUCTIVE_PATTERNS bash gate + read-only tool allowlist
 *   - Todo tool (LLM-callable, state in tool result details)
 *   - Memory commands: /btw, /context, /memory-add, /memory-search, /memory-list, /memory-forget
 *   - REPL helpers: :mode, :plan, :todos, :config, :doctor
 *   - Config: ~/.pi/pi.json (Zod-validated via @pi-pro/config)
 *
 * Install: `pi install ./packages/pi-pro-ext`
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig, saveConfig, getDefaultModes, cycleMode as cycleModeCfg } from "@pi-pro/config";

const DESTRUCTIVE_BASH: RegExp[] = [
  /\brm\s+-rf?\s+\/(?!\w)/i,
  /\brm\s+-rf?\s+~/i,
  /\bcurl\s+[^|]*\|\s*(sh|bash)/i,
  /\bsudo\b/i,
  /\bchmod\s+777\b/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bgit\s+(push|reset\s+--hard|clean\s+-fd)\b/i,
];

function isBashDestructive(cmd: string): boolean {
  return DESTRUCTIVE_BASH.some((p) => p.test(cmd));
}

function maskKey(k: string): string {
  if (k.length <= 8) return "****";
  return `${k.slice(0, 4)}...${k.slice(-4)}`;
}

function getEnvKey(provider: string): string | undefined {
  const map: Record<string, string> = {
    "opencode-go": "OPENCODE_GO_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "google": "GOOGLE_API_KEY",
  };
  return process.env[map[provider] ?? `${provider.toUpperCase()}_API_KEY`];
}

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

const TODO_INIT: { items: TodoItem[]; nextId: number } = { items: [], nextId: 1 };

function todoAdd(state: typeof TODO_INIT, text: string): { state: typeof TODO_INIT; item?: TodoItem; error?: string } {
  if (!text.trim()) return { state, error: "text required for add" };
  const item: TodoItem = { id: state.nextId, text: text.trim(), done: false };
  return { state: { items: [...state.items, item], nextId: state.nextId + 1 }, item };
}

function todoToggle(state: typeof TODO_INIT, id: number): { state: typeof TODO_INIT; error?: string } {
  const item = state.items.find((t) => t.id === id);
  if (!item) return { state, error: `todo #${id} not found` };
  return { state: { items: state.items.map((t) => (t.id === id ? { ...t, done: !t.done } : t)), nextId: state.nextId } };
}

function todoClear(): typeof TODO_INIT {
  return { items: [], nextId: 1 };
}

function renderTodos(state: typeof TODO_INIT): string {
  if (state.items.length === 0) return "  (no todos)";
  const done = state.items.filter((t) => t.done).length;
  const lines = [`  ${done}/${state.items.length} completed`];
  for (const t of state.items) {
    lines.push(`  ${t.done ? "✓" : "○"} #${t.id} ${t.text}`);
  }
  return lines.join("\n");
}

export default function (pi: ExtensionAPI): void {
  const todoState: { items: TodoItem[]; nextId: number } = { items: [], nextId: 1 };

  function getCurrentModeName(): string {
    try {
      return loadConfig().agent.name;
    } catch {
      return "build";
    }
  }

  function setModeName(name: string): void {
    try {
      const cfg = loadConfig();
      cfg.agent.name = name;
      saveConfig(cfg);
    } catch {
      // best-effort: no config yet
    }
  }

  function applyActiveTools(modeName: string): void {
    const modes = getDefaultModes();
    const m = modes.find((x) => x.name === modeName);
    if (!m) return;
    if (m.activeTools.length > 0) {
      pi.setActiveTools(m.activeTools as never);
    }
    // For build mode (empty activeTools): don't call setActiveTools.
    // pi-mono's default is to enable all tools; calling with empty array
    // would be an error. Restoring on cycle-to-build leaves tools as-is.
  }

  function updateModeStatus(modeName: string): void {
    pi.setStatus?.("pi-pro-mode", `${modeName} · tab: cycle · :mode to switch`);
  }

  function planSystemPrompt(): string {
    return `[PLAN MODE ACTIVE]
You are in plan mode — a read-only exploration mode.

Restrictions:
- Tools: read, bash (filtered), grep, find, ls
- Bash: blocked by DESTRUCTIVE_PATTERNS (rm -rf, sudo, chmod 777, git push, etc.)
- NO edits, writes, or file modifications

Describe plans under a "Plan:" header with numbered steps:
Plan:
1. First step
2. Second step

When execution starts, mark steps done with [DONE:n] markers.`;
  }

  pi.on("session_start", async (_event, _ctx) => {
    const modeName = getCurrentModeName();
    applyActiveTools(modeName);
    updateModeStatus(modeName);
    if (_ctx.hasUI) {
      _ctx.ui.notify(`pi-pro v0.1.0 · mode: ${modeName}`, "info");
    }
  });

  pi.on("tool_call", async (event) => {
    const modeName = getCurrentModeName();
    if (modeName !== "plan") return;
    if (event.toolName === "bash") {
      const input = event.input as { command?: string };
      const cmd = input.command ?? "";
      if (isBashDestructive(cmd)) {
        return { block: true, reason: `Plan mode: bash blocked (destructive pattern). Command: ${cmd.slice(0, 200)}` };
      }
    }
    if (event.toolName === "write" || event.toolName === "edit") {
      return { block: true, reason: "Plan mode is read-only (no edits/writes). Use :mode build to switch." };
    }
  });

  pi.on("before_agent_start", async () => {
    const modeName = getCurrentModeName();
    if (modeName !== "plan") return;
    return {
      message: {
        customType: "pi-pro-plan-mode",
        content: planSystemPrompt(),
        display: false,
      },
    };
  });

  pi.registerCommand("mode", {
    description: "Show/cycle/set agent mode (build | plan). Use Tab in editor to cycle.",
    handler: async (args, _ctx) => {
      const arg = args?.trim();
      if (!arg) {
        const cfg = loadConfig();
        for (const m of getDefaultModes()) {
          const marker = m.name === cfg.agent.name ? "→" : " ";
          _ctx.ui.notify(`${marker} ${m.name}  ${m.label}${m.readOnly ? " (read-only)" : ""}`, "info");
        }
        return;
      }
      const target = getDefaultModes().find((m) => m.name === arg);
      if (!target) {
        _ctx.ui.notify(`unknown mode: ${arg} (available: build, plan)`, "error");
        return;
      }
      setModeName(target.name);
      applyActiveTools(target.name);
      updateModeStatus(target.name);
      _ctx.ui.notify(`mode: ${target.name} (${target.label})${target.readOnly ? " — read-only" : ""}`, "info");
    },
  });

  pi.registerCommand("plan", {
    description: "Toggle plan mode (read-only). Cycles build ↔ plan.",
    handler: async (_args, _ctx) => {
      const current = getCurrentModeName();
      const target = current === "plan" ? "build" : "plan";
      setModeName(target);
      applyActiveTools(target);
      updateModeStatus(target);
      _ctx.ui.notify(`plan mode: ${target === "plan" ? "ON (read-only)" : "OFF (build)"}`, "info");
    },
  });

  pi.registerTool({
    name: "todo",
    label: "Todo",
    description: "Manage a todo list. Actions: list, add (text), toggle (id), clear.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("list"), Type.Literal("add"), Type.Literal("toggle"), Type.Literal("clear")]),
      text: Type.Optional(Type.String()),
      id: Type.Optional(Type.Number()),
    }),
    async execute(_id, params) {
      const p = params as { action: string; text?: string; id?: number };
      if (p.action === "list") {
        return {
          content: [{ type: "text", text: renderTodos(todoState) }],
          details: { items: todoState.items, nextId: todoState.nextId, action: "list" },
        };
      }
      if (p.action === "add") {
        const r = todoAdd(todoState, p.text ?? "");
        if (r.error) {
          return { content: [{ type: "text", text: `error: ${r.error}` }], details: { items: todoState.items, nextId: todoState.nextId, error: r.error } };
        }
        todoState.items = r.state.items;
        todoState.nextId = r.state.nextId;
        const added = r.item!;
        return {
          content: [{ type: "text", text: `added #${added.id}: ${added.text}` }],
          details: { items: todoState.items, nextId: todoState.nextId, action: "add", addedId: added.id },
        };
      }
      if (p.action === "toggle") {
        if (p.id === undefined) {
          return { content: [{ type: "text", text: "error: id required for toggle" }], details: { items: todoState.items, nextId: todoState.nextId, error: "id required" } };
        }
        const r = todoToggle(todoState, p.id);
        todoState.items = r.state.items;
        todoState.nextId = r.state.nextId;
        if (r.error) {
          return { content: [{ type: "text", text: `error: ${r.error}` }], details: { items: todoState.items, nextId: todoState.nextId, error: r.error } };
        }
        return { content: [{ type: "text", text: `toggled #${p.id}` }], details: { items: todoState.items, nextId: todoState.nextId, action: "toggle" } };
      }
      if (p.action === "clear") {
        const cleared = todoState.items.length;
        const fresh = todoClear();
        todoState.items = fresh.items;
        todoState.nextId = fresh.nextId;
        return { content: [{ type: "text", text: `cleared ${cleared} todo(s)` }], details: { items: [], nextId: 1, action: "clear" } };
      }
      return { content: [{ type: "text", text: `unknown action: ${p.action}` }] };
    },
  });

  pi.registerCommand("todos", {
    description: "Show current todo list",
    handler: async (_args, _ctx) => {
      _ctx.ui.notify(renderTodos(todoState), "info");
    },
  });

  pi.registerCommand("config", {
    description: "Show pi-pro config",
    handler: async (_args, _ctx) => {
      try {
        const cfg = loadConfig();
        const lines = [
          `pi-pro config · v0.1.0`,
          `─`.repeat(40),
          `  provider:  ${cfg.provider.name}`,
          `  model:     ${cfg.provider.model}`,
          cfg.provider.baseUrl ? `  baseUrl:   ${cfg.provider.baseUrl}` : "",
          `  agent:     ${cfg.agent.name}`,
          `  max iter:  ${cfg.agent.maxIterations}`,
          `  tool budget: ${cfg.agent.toolBudget}`,
        ].filter(Boolean);
        _ctx.ui.notify(lines.join("\n"), "info");
      } catch (e) {
        _ctx.ui.notify(`error loading config: ${(e as Error).message}`, "error");
      }
    },
  });

  pi.registerCommand("doctor", {
    description: "Check system + pi-pro config",
    handler: async (_args, _ctx) => {
      const lines = ["pi-pro doctor", "─".repeat(40)];
      try {
        const cfg = loadConfig();
        const key = getEnvKey(cfg.provider.name);
        lines.push(`  provider:  ${cfg.provider.name}`);
        lines.push(`  model:     ${cfg.provider.model}`);
        lines.push(`  api key:   ${key ? `✓ ${maskKey(key)}` : "✗ (no key in env)"}`);
        lines.push(`  mode:      ${cfg.agent.name}${cfg.agent.name === "plan" ? " (read-only)" : ""}`);
        lines.push(`  cwd:       ${process.cwd()}`);
      } catch (e) {
        lines.push(`  error: ${(e as Error).message}`);
      }
      _ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("memory-add", {
    description: "Add a chunk to cross-session memory (v0.7.0+ feature placeholder)",
    handler: async (args, _ctx) => {
      const text = args?.trim();
      if (!text) {
        _ctx.ui.notify("usage: /memory-add <text>", "error");
        return;
      }
      _ctx.ui.notify(`memory-add is a v0.7.0 feature; in v0.1.0 it's a placeholder.`, "info");
      _ctx.ui.notify(`would store: ${text.slice(0, 100)}`, "info");
    },
  });

  pi.registerCommand("memory-list", {
    description: "List memory sources (v0.7.0+ feature placeholder)",
    handler: async (_args, _ctx) => {
      _ctx.ui.notify("(no memory sources in v0.1.0; placeholder)", "info");
    },
  });

  pi.registerCommand("memory-search", {
    description: "Search memory (v0.7.0+ feature placeholder)",
    handler: async (args, _ctx) => {
      const q = args?.trim() ?? "";
      if (!q) {
        _ctx.ui.notify("usage: /memory-search <query>", "error");
        return;
      }
      _ctx.ui.notify(`(v0.1.0 placeholder; would search: ${q})`, "info");
    },
  });

  pi.registerCommand("btw", {
    description: "Side question (v0.7.0+ feature placeholder; pi-mono handles natively)",
    handler: async (args, _ctx) => {
      const q = args?.trim() ?? "";
      if (!q) {
        _ctx.ui.notify("usage: /btw <question>", "error");
        return;
      }
      _ctx.ui.notify(`(v0.1.0 placeholder; would btw: ${q.slice(0, 100)})`, "info");
    },
  });

  pi.registerCommand("context", {
    description: "Show context budget breakdown (v0.7.0+ feature placeholder)",
    handler: async (_args, _ctx) => {
      _ctx.ui.notify("(v0.1.0 placeholder; would show context stats)", "info");
    },
  });

  pi.registerShortcut("tab", {
    description: "Cycle agent mode (build ↔ plan)",
    handler: async (_ctx) => {
      const current = getCurrentModeName();
      const next = cycleModeCfg(current, getDefaultModes());
      setModeName(next);
      applyActiveTools(next);
      updateModeStatus(next);
      _ctx.ui.notify(`mode: ${current} → ${next}`, "info");
    },
  });

  void cycleModeCfg;
  void planSystemPrompt;
}

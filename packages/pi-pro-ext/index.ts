/**
 * pi-pro v0.2.3 — extension for pi-mono.
 *
 * Loaded automatically by `pi` when registered in ~/.pi/agent/settings.json.
 * Composes with pi-zentui (also installed) which provides the Starship-style
 * footer and Opencode-style editor. This extension publishes:
 *   - "pi-pro" status (mode + version) picked up by pi-zentui
 *   - "pi-pro-plan" widget above editor for plan-mode progress
 *
 * Commands (all registered with both `:` and `/` aliases for ergonomics):
 *   mode, plan, todos, config, doctor, theme, login,
 *   memory-add, memory-list, memory-search, memory-clear,
 *   btw, context
 *
 * Install: `pi install ./packages/pi-pro-ext` + `pi install npm:pi-zentui`
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig, saveConfig, getDefaultModes, cycleMode as cycleModeCfg } from "@pi-pro/config";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, chmodSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { parsePlanItems, markPlanDone, renderPlanWidget, isSafeBash } from "./src/plan-widget.js";
import { summarizeGitStatus } from "./src/util/git-status.js";
import { detectRuntime, formatRuntime } from "./src/util/runtime-detect.js";
import {
  addMemory,
  clearMemory,
  listMemory,
  loadMemoryState,
  searchMemory,
  type MemoryState,
} from "./src/memory.js";

const VERSION = "0.2.3";
const STATUS_KEY = "pi-pro";
const WIDGET_KEY = "pi-pro-plan";

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

interface AgentMode { name: string; label: string; activeTools: string[]; readOnly: boolean; systemPromptAppend?: string; bashAllowlist?: RegExp[] }

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];

function getCurrentModeName(): string {
  try { return loadConfig().agent.name; } catch { return "build"; }
}

function setModeName(name: string): void {
  try {
    const cfg = loadConfig();
    cfg.agent.name = name;
    saveConfig(cfg);
  } catch {
    // best-effort
  }
}

function readGit(cwd: string): { branch: string | null; ahead: number; behind: number; porcelain: string } {
  try { execSync("test -d .git", { cwd, stdio: "ignore" }); } catch { return { branch: null, ahead: 0, behind: 0, porcelain: "" }; }
  let branch: string | null = null;
  let ahead = 0;
  let behind = 0;
  let porcelain = "";
  try { branch = execSync("git rev-parse --abbrev-ref HEAD 2>/dev/null", { cwd, encoding: "utf8" }).trim() || null; } catch { branch = null; }
  try { porcelain = execSync("git status --porcelain 2>/dev/null", { cwd, encoding: "utf8" }); } catch { porcelain = ""; }
  try {
    const counts = execSync('git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null || echo "0\t0"', { cwd, encoding: "utf8" }).trim().split(/\s+/);
    ahead = parseInt(counts[0] ?? "0", 10) || 0;
    behind = parseInt(counts[1] ?? "0", 10) || 0;
  } catch { ahead = 0; behind = 0; }
  return { branch, ahead, behind, porcelain };
}

function maskKey(k: string): string {
  if (k.length <= 8) return "****";
  return `${k.slice(0, 4)}...${k.slice(-4)}`;
}

function getEnvKey(provider: string): string | undefined {
  const map: Record<string, string> = {
    "opencode-go": "OPENCODE_API_KEY",
    "opencode": "OPENCODE_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "google": "GEMINI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "groq": "GROQ_API_KEY",
    "minimax": "MINIMAX_API_KEY",
  };
  return process.env[map[provider] ?? `${provider.toUpperCase()}_API_KEY`];
}

function getAuthPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "pi-pro");
  return join(process.env.PI_HOME_OVERRIDE ?? homedir(), ".pi", "agent");
}

function readAuthJson(): Record<string, { type: "api_key"; key: string }> {
  const p = join(getAuthPath(), "auth.json");
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return {}; }
}

function writeAuthJson(data: Record<string, { type: "api_key"; key: string }>): void {
  const dir = getAuthPath();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = join(dir, "auth.json");
  writeFileSync(p, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  chmodSync(p, 0o600);
}

function hasAuth(provider: string): { ok: boolean; source: "env" | "auth.json" | "none"; key?: string } {
  const envKey = getEnvKey(provider);
  if (envKey) return { ok: true, source: "env", key: envKey };
  const auth = readAuthJson();
  if (auth[provider]?.key) return { ok: true, source: "auth.json", key: auth[provider].key };
  return { ok: false, source: "none" };
}

function buildStatusLine(version: string, mode: string, nerdFonts: boolean): string {
  const cwd = process.cwd().split("/").filter(Boolean).pop() ?? "/";
  const cwdIcon = nerdFonts ? "" : "";
  const isPlan = mode === "plan";
  const modeBadge = isPlan ? "PLAN RO" : "BUILD";
  return `v${version} ${modeBadge} · ${cwdIcon}${cwd}`;
}

function todoAdd(state: { items: TodoItem[]; nextId: number }, text: string): { state: { items: TodoItem[]; nextId: number }; item?: TodoItem; error?: string } {
  if (!text.trim()) return { state, error: "text required for add" };
  const item: TodoItem = { id: state.nextId, text: text.trim(), done: false };
  return { state: { items: [...state.items, item], nextId: state.nextId + 1 }, item };
}

function todoToggle(state: { items: TodoItem[]; nextId: number }, id: number): { state: { items: TodoItem[]; nextId: number }; error?: string } {
  const item = state.items.find((t) => t.id === id);
  if (!item) return { state, error: `todo #${id} not found` };
  return { state: { items: state.items.map((t) => (t.id === id ? { ...t, done: !t.done } : t)), nextId: state.nextId } };
}

function todoClear(): { items: TodoItem[]; nextId: number } {
  return { items: [], nextId: 1 };
}

function renderTodos(state: { items: TodoItem[]; nextId: number }): string {
  if (state.items.length === 0) return "  (no todos)";
  const done = state.items.filter((t) => t.done).length;
  const lines = [`  ${done}/${state.items.length} completed`];
  for (const t of state.items) {
    lines.push(`  ${t.done ? "v" : "o"} #${t.id} ${t.text}`);
  }
  return lines.join("\n");
}

function getNerdFonts(): boolean {
  const term = (process.env.TERM ?? "").toLowerCase();
  const fontName = (process.env.FONT_NAME ?? "").toLowerCase();
  const indicators = ["nerd", "nfont", "meslo", "jetbrainsmono nf", "fira code nf", "cascadia code nf"];
  return indicators.some((i) => term.includes(i) || fontName.includes(i));
}

export default function (pi: ExtensionAPI): void {
  const todoState: { items: TodoItem[]; nextId: number } = { items: [], nextId: 1 };
  const memState: MemoryState = loadMemoryState();
  let planItems: { step: number; text: string; completed: boolean }[] = [];
  let lastPlanText = "";
  let allToolNames: string[] = [];

  function modeOf(): string {
    return getCurrentModeName();
  }

  function setModeAndPersist(name: string, ctx: { ui: { setStatus: (k: string, t: string | undefined) => void; setWidget: (k: string, c: string[] | undefined) => void; notify: (m: string, t?: "info" | "warning" | "error") => void } }): void {
    setModeName(name);
    applyActiveTools(name);
    ctx.ui.setStatus(STATUS_KEY, buildStatusLine(VERSION, name, getNerdFonts()));
    if (name !== "plan") {
      planItems = [];
      lastPlanText = "";
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }
  }

  function applyActiveTools(modeName: string): void {
    if (modeName === "plan") {
      pi.setActiveTools(PLAN_MODE_TOOLS as never);
    } else {
      if (allToolNames.length === 0) {
        try { allToolNames = pi.getAllTools().map((t) => t.name); } catch { allToolNames = []; }
      }
      if (allToolNames.length > 0) {
        pi.setActiveTools(allToolNames as never);
      }
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    const modeName = modeOf();
    allToolNames = (() => {
      try { return pi.getAllTools().map((t) => t.name); } catch { return []; }
    })();
    applyActiveTools(modeName);
    ctx.ui.setStatus(STATUS_KEY, buildStatusLine(VERSION, modeName, getNerdFonts()));
    if (ctx.hasUI) {
      const note = `pi-pro v${VERSION} · ${modeName}${modeName === "plan" ? " (read-only)" : ""}`;
      ctx.ui.notify(note, "info");
    }
  });

  pi.on("tool_call", async (event) => {
    const modeName = modeOf();
    if (modeName !== "plan") return;
    if (event.toolName === "bash") {
      const input = event.input as { command?: string };
      const cmd = input.command ?? "";
      if (isSafeBash(cmd)) return;
      return { block: true, reason: `Plan mode: bash blocked (destructive pattern). Command: ${cmd.slice(0, 200)}` };
    }
    if (event.toolName === "write" || event.toolName === "edit") {
      return { block: true, reason: "Plan mode is read-only (no edits/writes). Use :mode build to switch." };
    }
  });

  pi.on("before_agent_start", async () => {
    const modeName = modeOf();
    if (modeName !== "plan") return;
    return {
      message: {
        customType: "pi-pro-plan-mode",
        content:
          `[PLAN MODE ACTIVE]\n` +
          `You are in plan mode — a read-only exploration mode.\n\n` +
          `Restrictions:\n- Tools: read, bash (filtered), grep, find, ls\n` +
          `- Bash: blocked by DESTRUCTIVE_PATTERNS (rm -rf, sudo, chmod 777, git push, etc.)\n` +
          `- NO edits, writes, or file modifications\n\n` +
          `Describe plans under a "Plan:" header with numbered steps:\n` +
          `Plan:\n1. First step\n2. Second step\n\n` +
          `When execution starts, mark steps done with [DONE:n] markers.`,
        display: false,
      },
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (modeOf() !== "plan") return;
    const last = [...(event.messages as { role: string; content: unknown }[])].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    const text = typeof last.content === "string" ? last.content : JSON.stringify(last.content);
    if (text !== lastPlanText) {
      lastPlanText = text;
      planItems = parsePlanItems(text);
    }
    if (planItems.length > 0) {
      markPlanDone(text, planItems);
      const lines = renderPlanWidget(planItems);
      if (lines.length > 0) {
        ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "aboveEditor" } as never);
      }
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (modeOf() !== "plan") return;
    if (planItems.length === 0) return;
    const lastMsg = (event.message ?? null) as { content?: unknown } | null;
    if (!lastMsg) return;
    const text = typeof lastMsg.content === "string"
      ? lastMsg.content
      : JSON.stringify(lastMsg.content ?? "");
    markPlanDone(text, planItems);
    const lines = renderPlanWidget(planItems);
    if (lines.length > 0) {
      ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "aboveEditor" } as never);
    }
  });

  pi.on("session_shutdown", async () => {
    planItems = [];
    lastPlanText = "";
  });

  function registerAlias(name: string, opts: { description: string; handler: (args: string | undefined, ctx: any) => Promise<any> | any }): void {
    pi.registerCommand(name, opts);
  }

  function registerWithColon(name: string, opts: { description: string; handler: (args: string | undefined, ctx: any) => Promise<any> | any }): void {
    registerAlias(name, opts);
    registerAlias(`:${name}`, opts);
  }

  registerWithColon("mode", {
    description: "Show/cycle/set agent mode (build | plan). Tab in editor to cycle.",
    handler: async (args, ctx) => {
      const arg = args?.trim();
      if (!arg) {
        const cfg = loadConfig();
        for (const m of getDefaultModes()) {
          const marker = m.name === cfg.agent.name ? ">" : " ";
          ctx.ui.notify(`${marker} ${m.name}  ${m.label}${m.readOnly ? " (read-only)" : ""}`, "info");
        }
        return;
      }
      const target = getDefaultModes().find((m) => m.name === arg);
      if (!target) {
        ctx.ui.notify(`unknown mode: ${arg} (available: build, plan)`, "error");
        return;
      }
      setModeAndPersist(target.name, ctx);
      ctx.ui.notify(`mode: ${target.name} (${target.label})${target.readOnly ? " — read-only" : ""}`, "info");
    },
  });

  registerWithColon("plan", {
    description: "Toggle plan mode (read-only). Cycles build <-> plan.",
    handler: async (_args, ctx) => {
      const current = modeOf();
      const target = current === "plan" ? "build" : "plan";
      setModeAndPersist(target, ctx);
      ctx.ui.notify(`plan mode: ${target === "plan" ? "ON (read-only)" : "OFF (build)"}`, "info");
    },
  });

  registerWithColon("todos", {
    description: "Show current todo list",
    handler: async (_args, ctx) => {
      ctx.ui.notify(renderTodos(todoState), "info");
    },
  });

  registerWithColon("config", {
    description: "Show pi-pro config",
    handler: async (_args, ctx) => {
      try {
        const cfg = loadConfig();
        const lines = [
          `pi-pro config · v${VERSION}`,
          `-`.repeat(40),
          `  provider:  ${cfg.provider.name}`,
          `  model:     ${cfg.provider.model}`,
          cfg.provider.baseUrl ? `  baseUrl:   ${cfg.provider.baseUrl}` : "",
          `  agent:     ${cfg.agent.name}`,
          `  max iter:  ${cfg.agent.maxIterations}`,
          `  tool budget: ${cfg.agent.toolBudget}`,
          `  modes:     ${getDefaultModes().map((m) => m.name).join(", ")}`,
        ].filter(Boolean);
        ctx.ui.notify(lines.join("\n"), "info");
      } catch (e) {
        ctx.ui.notify(`error loading config: ${(e as Error).message}`, "error");
      }
    },
  });

  registerWithColon("doctor", {
    description: "Check system + pi-pro config",
    handler: async (_args, ctx) => {
      const lines = [`pi-pro doctor v${VERSION}`, `-`.repeat(40)];
      try {
        const cfg = loadConfig();
        const auth = hasAuth(cfg.provider.name);
        lines.push(`  provider:  ${cfg.provider.name}`);
        lines.push(`  model:     ${cfg.provider.model}`);
        lines.push(`  api key:   ${auth.ok ? `v ${maskKey(auth.key!)} (${auth.source})` : "X (no key in env or auth.json)"}`);
        lines.push(`  mode:      ${cfg.agent.name}${cfg.agent.name === "plan" ? " (read-only)" : ""}`);
        lines.push(`  cwd:       ${process.cwd()}`);
        const git = readGit(process.cwd());
        if (git.branch) {
          const summary = summarizeGitStatus(git.porcelain, git.branch, git.ahead, git.behind, getNerdFonts());
          lines.push(`  git:       ${git.branch} ${summary.icons}`);
        }
        const runtime = detectRuntime(process.cwd());
        if (runtime) lines.push(`  runtime:   ${formatRuntime(runtime)}`);
        const allTools = (() => { try { return pi.getAllTools().length; } catch { return 0; } })();
        lines.push(`  tools:     ${allTools} available`);
      } catch (e) {
        lines.push(`  error: ${(e as Error).message}`);
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  registerWithColon("theme", {
    description: "Open pi-zentui's /zentui config (pi-zentui must be installed)",
    handler: async (_args, ctx) => {
      ctx.ui.notify("pi-zentui owns the theme. Use /zentui to configure.", "info");
    },
  });

  registerWithColon("login", {
    description: "Set API key for a provider. Writes to ~/.pi/agent/auth.json (0600). Usage: :login <provider> [key]",
    handler: async (args, ctx) => {
      const parts = (args ?? "").trim().split(/\s+/);
      const provider = parts[0];
      let key = parts.slice(1).join(" ");
      if (!provider) {
        ctx.ui.notify("usage: :login <provider> [key]  (provider examples: opencode-go, anthropic, openai)", "error");
        return;
      }
      if (!key) {
        try {
          const got = await ctx.ui.input(`Enter API key for ${provider}:`, "");
          if (!got) {
            ctx.ui.notify("login cancelled (no key)", "info");
            return;
          }
          key = got.trim();
        } catch {
          ctx.ui.notify("login cancelled (no input available)", "info");
          return;
        }
      }
      try {
        const auth = readAuthJson();
        auth[provider] = { type: "api_key", key };
        writeAuthJson(auth);
        ctx.ui.notify(`v saved ${provider} key to auth.json (masked: ${maskKey(key)})`, "info");
      } catch (e) {
        ctx.ui.notify(`login failed: ${(e as Error).message}`, "error");
      }
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
      const p = params as { action: "list" | "add" | "toggle" | "clear"; text?: string; id?: number };
      const text = (s: string) => [{ type: "text" as const, text: s }];
      if (p.action === "list") {
        return {
          content: text(renderTodos(todoState)),
          details: { items: todoState.items, nextId: todoState.nextId, action: "list" as const } as TodoDetails,
        };
      }
      if (p.action === "add") {
        const r = todoAdd(todoState, p.text ?? "");
        if (r.error) {
          return {
            content: text(`error: ${r.error}`),
            details: { items: todoState.items, nextId: todoState.nextId, error: r.error } as TodoDetails,
          };
        }
        todoState.items = r.state.items;
        todoState.nextId = r.state.nextId;
        const added = r.item!;
        return {
          content: text(`added #${added.id}: ${added.text}`),
          details: { items: todoState.items, nextId: todoState.nextId, action: "add" as const, addedId: added.id } as TodoDetails,
        };
      }
      if (p.action === "toggle") {
        if (p.id === undefined) {
          return {
            content: text("error: id required for toggle"),
            details: { items: todoState.items, nextId: todoState.nextId, error: "id required" } as TodoDetails,
          };
        }
        const r = todoToggle(todoState, p.id);
        todoState.items = r.state.items;
        todoState.nextId = r.state.nextId;
        if (r.error) {
          return {
            content: text(`error: ${r.error}`),
            details: { items: todoState.items, nextId: todoState.nextId, error: r.error } as TodoDetails,
          };
        }
        return {
          content: text(`toggled #${p.id}`),
          details: { items: todoState.items, nextId: todoState.nextId, action: "toggle" as const } as TodoDetails,
        };
      }
      if (p.action === "clear") {
        const cleared = todoState.items.length;
        const fresh = todoClear();
        todoState.items = fresh.items;
        todoState.nextId = fresh.nextId;
        return {
          content: text(`cleared ${cleared} todo(s)`),
          details: { items: [], nextId: 1, action: "clear" as const } as TodoDetails,
        };
      }
      return {
        content: text(`unknown action: ${p.action}`),
        details: { items: todoState.items, nextId: todoState.nextId, error: `unknown action: ${p.action}` } as TodoDetails,
      };
    },
  });

  registerWithColon("memory-add", {
    description: "Add a chunk to cross-session memory",
    handler: async (args, ctx) => {
      const text = args?.trim();
      if (!text) { ctx.ui.notify("usage: :memory-add <text>", "error"); return; }
      const r = addMemory(memState, text, "narrative");
      Object.assign(memState, r.state);
      ctx.ui.notify(`v added #${r.entry.ts} (${memState.entries.length} total)`, "info");
    },
  });

  registerWithColon("memory-list", {
    description: "List memory entries (newest first)",
    handler: async (_args, ctx) => {
      const entries = listMemory(memState);
      if (entries.length === 0) { ctx.ui.notify("(no memory entries)", "info"); return; }
      const lines = entries.slice(0, 20).map((e) => `  #${e.ts} [${e.role}] ${e.text.slice(0, 80)}`);
      if (entries.length > 20) lines.push(`  ... and ${entries.length - 20} more`);
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  registerWithColon("memory-search", {
    description: "Search memory entries",
    handler: async (args, ctx) => {
      const q = args?.trim();
      if (!q) { ctx.ui.notify("usage: :memory-search <query>", "error"); return; }
      const results = searchMemory(memState, q, 5);
      if (results.length === 0) { ctx.ui.notify(`no matches for: ${q}`, "info"); return; }
      const lines = results.map((e) => `  #${e.ts} [${e.role}] ${e.text.slice(0, 100)}`);
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  registerWithColon("memory-clear", {
    description: "Clear all memory entries",
    handler: async (_args, ctx) => {
      const n = memState.entries.length;
      const fresh = clearMemory(memState);
      Object.assign(memState, fresh);
      ctx.ui.notify(`v cleared ${n} entries`, "info");
    },
  });

  registerWithColon("btw", {
    description: "Side question (queues a message to the agent without polluting main history)",
    handler: async (args, ctx) => {
      const q = args?.trim();
      if (!q) { ctx.ui.notify("usage: :btw <question>", "error"); return; }
      pi.sendUserMessage(`[side question, no edit] ${q}`);
      ctx.ui.notify(`queued btw: ${q.slice(0, 80)}`, "info");
    },
  });

  registerWithColon("context", {
    description: "Show context budget breakdown",
    handler: async (_args, ctx) => {
      const usage = (ctx as { getContextUsage?: () => { tokens: number | null; contextWindow: number; percent: number | null } | null | undefined }).getContextUsage?.();
      if (!usage) {
        ctx.ui.notify("(context usage not available)", "info");
        return;
      }
      if (usage.tokens == null || usage.contextWindow == null || usage.percent == null) {
        ctx.ui.notify("ctx: (compacting or no model context window)", "info");
        return;
      }
      const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
      const color = usage.percent < 0.75 ? "ok" : usage.percent < 0.9 ? "warn" : "high";
      ctx.ui.notify(`ctx: ${fmt(usage.tokens)}/${fmt(usage.contextWindow)} (${Math.round(usage.percent * 100)}%) ${color}`, "info");
    },
  });

  pi.registerShortcut("tab", {
    description: "Cycle agent mode (build <-> plan). Overrides built-in Tab.",
    handler: async (ctx) => {
      const current = modeOf();
      const next = cycleModeCfg(current, getDefaultModes());
      setModeAndPersist(next, ctx);
      ctx.ui.notify(`mode: ${current} -> ${next}`, "info");
    },
  });
}

type TodoDetails = { items: TodoItem[]; nextId: number; action?: "list" | "add" | "toggle" | "clear"; error?: string; addedId?: number };

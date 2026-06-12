/**
 * Integration test harness — drives the pi-pro extension end-to-end
 * with a mock ExtensionAPI. Exercises every registered command, tool,
 * event handler, and shortcut. Verifies side effects (notify, setStatus,
 * setWidget, sendUserMessage, appendEntry) and config persistence.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

type AnyHandler = (event: any, ctx: any) => Promise<any> | any;
type CmdHandler = (args: string | undefined, ctx: any) => Promise<any> | any;
type ShortcutHandler = (ctx: any) => Promise<any> | any;
type ToolExecute = (
  toolCallId: string,
  params: any,
  signal: AbortSignal | undefined,
  onUpdate: any,
  ctx: any,
) => Promise<any>;

interface MockPi {
  handlers: Map<string, AnyHandler[]>;
  commands: Map<string, { description: string; handler: CmdHandler }>;
  tools: Map<string, { label: string; description: string; parameters: any; execute: ToolExecute; renderCall?: any; renderResult?: any }>;
  shortcuts: Map<string, { description: string; handler: ShortcutHandler }>;
  flags: Map<string, any>;
  activeTools: string[] | null;
  sentMessages: Array<{ type: "user" | "custom"; content: any; options?: any }>;
  execCalls: Array<{ command: string; args: string[] }>;
  appendEntryCalls: Array<{ type: string; data: any }>;
  on: (event: string, handler: AnyHandler) => void;
  registerCommand: (name: string, opts: { description: string; handler: CmdHandler }) => void;
  registerTool: (tool: any) => void;
  registerShortcut: (key: string, opts: { description: string; handler: ShortcutHandler }) => void;
  registerFlag: (name: string, opts: any) => void;
  setActiveTools: (names: string[]) => void;
  getActiveTools: () => string[];
  getAllTools: () => Array<{ name: string }>;
  sendUserMessage: (content: any, options?: any) => void;
  sendMessage: (message: any, options?: any) => void;
  appendEntry: (type: string, data?: any) => void;
  exec: (command: string, args: string[], options?: any) => Promise<any>;
  getFlag: (name: string) => any;
  getCommands: () => any[];
  setSessionName: (n: string) => void;
  getSessionName: () => string | undefined;
  setLabel: (id: string, label: string | undefined) => void;
}

function makeMockPi(): MockPi {
  const pi: MockPi = {
    handlers: new Map(),
    commands: new Map(),
    tools: new Map(),
    shortcuts: new Map(),
    flags: new Map(),
    activeTools: null,
    sentMessages: [],
    execCalls: [],
    appendEntryCalls: [],
  } as any;
  pi.on = (event, handler) => {
    const list = pi.handlers.get(event) ?? [];
    list.push(handler);
    pi.handlers.set(event, list);
  };
  pi.registerCommand = (name, opts) => {
    pi.commands.set(name, opts);
  };
  pi.registerTool = (tool) => {
    pi.tools.set(tool.name, tool);
  };
  pi.registerShortcut = (key, opts) => {
    pi.shortcuts.set(key, opts);
  };
  pi.registerFlag = (name, opts) => {
    pi.flags.set(name, opts);
  };
  pi.setActiveTools = (names) => {
    pi.activeTools = names;
  };
  pi.getActiveTools = () => pi.activeTools ?? [];
  pi.getAllTools = () => [];
  pi.sendUserMessage = (content, options) => {
    pi.sentMessages.push({ type: "user", content, options });
  };
  pi.sendMessage = (message, options) => {
    pi.sentMessages.push({ type: "custom", content: message, options });
  };
  pi.appendEntry = (type, data) => {
    pi.appendEntryCalls.push({ type, data });
  };
  pi.exec = async (command, args) => ({ stdout: "", stderr: "", exitCode: 0 });
  pi.getFlag = (name) => pi.flags.get(name)?.default;
  pi.getCommands = () => Array.from(pi.commands.entries()).map(([name, c]) => ({ name, description: c.description }));
  pi.setSessionName = () => {};
  pi.getSessionName = () => undefined;
  pi.setLabel = () => {};
  return pi;
}

interface MockUI {
  notifies: Array<{ message: string; type: "info" | "warning" | "error" }>;
  statuses: Map<string, string | undefined>;
  widgets: Map<string, string[] | undefined>;
  setStatus: (key: string, text: string | undefined) => void;
  setWidget: (key: string, content: string[] | undefined, options?: any) => void;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
  select: (title: string, options: string[], opts?: any) => Promise<string | undefined>;
  confirm: (title: string, message: string, opts?: any) => Promise<boolean>;
  input: (title: string, placeholder?: string, opts?: any) => Promise<string | undefined>;
  setWorkingMessage: (msg?: string) => void;
  setHiddenThinkingLabel: (label?: string) => void;
  onTerminalInput: (h: any) => () => void;
}

function makeMockUI(): MockUI {
  const ui: MockUI = {
    notifies: [],
    statuses: new Map(),
    widgets: new Map(),
  } as any;
  ui.setStatus = (key, text) => ui.statuses.set(key, text);
  ui.setWidget = (key, content) => ui.widgets.set(key, content);
  ui.notify = (message, type = "info") => ui.notifies.push({ message, type });
  ui.select = async () => undefined;
  ui.confirm = async () => false;
  ui.input = async () => undefined;
  ui.setWorkingMessage = () => {};
  ui.setHiddenThinkingLabel = () => {};
  ui.onTerminalInput = () => () => {};
  return ui;
}

function makeMockCtx(overrides: Partial<{
  hasUI: boolean;
  ui: MockUI;
  getContextUsage: () => any;
  abort: () => void;
  shutdown: () => void;
  getModel: () => any;
  isIdle: () => boolean;
  compact: () => void;
  newSession: () => any;
  hasPendingMessages: () => boolean;
  getSystemPrompt: () => string;
  waitForIdle: () => Promise<void>;
}> = {}) {
  return {
    hasUI: overrides.hasUI ?? true,
    ui: overrides.ui ?? makeMockUI(),
    getContextUsage: overrides.getContextUsage ?? (() => ({ tokens: 5000, contextWindow: 200000, percent: 0.025 })),
    abort: overrides.abort ?? (() => {}),
    shutdown: overrides.shutdown ?? (() => {}),
    getModel: overrides.getModel ?? (() => ({ provider: "opencode-go", id: "kimi-k2.6" })),
    isIdle: overrides.isIdle ?? (() => true),
    compact: overrides.compact ?? (() => {}),
    newSession: overrides.newSession ?? (async () => ({})),
    hasPendingMessages: overrides.hasPendingMessages ?? (() => false),
    getSystemPrompt: overrides.getSystemPrompt ?? (() => ""),
    waitForIdle: overrides.waitForIdle ?? (async () => {}),
  };
}

let tmpHome: string;
let originalHome: string;
let originalXdg: string | undefined;
const configPath = () => join(tmpHome, ".pi", "agent", "pi.json");
const getAuthPath = () => join(tmpHome, ".pi", "agent");
const writeConfig = (data: object) => {
  mkdirSync(join(tmpHome, ".pi", "agent"), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(data) as string);
};

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "pi-pro-int-"));
  originalHome = process.env.HOME ?? "";
  originalXdg = process.env.XDG_CONFIG_HOME;
  process.env.HOME = tmpHome;
  process.env.PI_HOME_OVERRIDE = tmpHome;
  delete process.env.XDG_CONFIG_HOME;
  process.env.NO_COLOR = "1";
  process.env.TERM = "dumb";
  delete process.env.OPENCODE_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  process.env.HOME = originalHome;
  if (originalXdg !== undefined) process.env.XDG_CONFIG_HOME = originalXdg;
  else delete process.env.XDG_CONFIG_HOME;
  delete process.env.PI_HOME_OVERRIDE;
  delete process.env.NO_COLOR;
  delete process.env.TERM;
  if (existsSync(tmpHome)) rmSync(tmpHome, { recursive: true, force: true });
});

async function loadExtension(): Promise<{ pi: MockPi; ui: MockUI; reload: () => Promise<{ pi: MockPi; ui: MockUI }> }> {
  const { default: factory } = await import("../index.js");
  const pi = makeMockPi();
  factory(pi as any);
  const ui = makeMockUI();
  const ctx = makeMockCtx({ ui });
  return {
    pi,
    ui,
    reload: async () => {
      vi.resetModules();
      const { default: f2 } = await import("../index.js");
      const pi2 = makeMockPi();
      f2(pi2 as any);
      const ui2 = makeMockUI();
      return { pi: pi2, ui: ui2 };
    },
  };
}

describe("extension wiring", () => {
  it("registers commands with both /name and :name aliases", async () => {
    const { pi } = await loadExtension();
    const names = ["mode", "plan", "todos", "config", "doctor", "login", "memory-add", "memory-list", "memory-search", "memory-clear", "btw", "context"];
    for (const name of names) {
      expect(pi.commands.has(name), `command /${name} registered`).toBe(true);
      expect(pi.commands.has(`:${name}`), `command :${name} registered`).toBe(true);
    }
    expect(pi.commands.has("theme")).toBe(true);
    expect(pi.commands.has(":theme")).toBe(true);
  });

  it("registers the todo tool", async () => {
    const { pi } = await loadExtension();
    expect(pi.tools.has("todo")).toBe(true);
  });

  it("registers the tab shortcut", async () => {
    const { pi } = await loadExtension();
    expect(pi.shortcuts.has("tab")).toBe(true);
  });

  it("registers all event handlers", async () => {
    const { pi } = await loadExtension();
    const events = ["session_start", "tool_call", "before_agent_start", "agent_end", "turn_end", "session_shutdown"];
    for (const e of events) {
      expect((pi.handlers.get(e) ?? []).length, `event ${e}`).toBeGreaterThan(0);
    }
  });
});

describe("session_start", () => {
  it("applies default mode and sets status", async () => {
    const { pi, ui } = await loadExtension();
    const handler = pi.handlers.get("session_start")![0]!;
    const ctx = makeMockCtx({ ui });
    await handler({}, ctx);
    expect(ui.statuses.get("pi-pro")).toBeDefined();
    expect(ui.statuses.get("pi-pro")!.length).toBeGreaterThan(0);
  });

  it("emits build notification by default", async () => {
    const { pi, ui } = await loadExtension();
    const handler = pi.handlers.get("session_start")![0]!;
    await handler({}, makeMockCtx({ ui }));
    const note = ui.notifies.find((n) => n.message.includes("pi-pro v"));
    expect(note).toBeDefined();
    expect(note!.message).toContain("build");
  });

  it("emits plan notification when config says plan", async () => {
    writeConfig({ version: 1, provider: { name: "opencode-go", model: "kimi-k2.6" }, agent: { name: "plan", maxIterations: 10, toolBudget: 6 }, theme: { name: "default" } });
    const { pi, ui } = await loadExtension();
    const handler = pi.handlers.get("session_start")![0]!;
    await handler({}, makeMockCtx({ ui }));
    const note = ui.notifies.find((n) => n.message.includes("read-only"));
    expect(note).toBeDefined();
  });
});

describe("tool_call in plan mode", () => {
  it("blocks rm -rf", async () => {
    const { pi } = await loadExtension();
    writeConfig({
      version: 1,
      provider: { name: "opencode-go", model: "kimi-k2.6" },
      agent: { name: "plan", maxIterations: 10, toolBudget: 6 },
      theme: { name: "default" },
    });
    const handler = pi.handlers.get("tool_call")![0]!;
    const result = await handler({ toolName: "bash", input: { command: "rm -rf /tmp/x" } }, makeMockCtx());
    expect(result).toEqual({ block: true, reason: expect.stringContaining("destructive") });
  });

  it("blocks write", async () => {
    const { pi } = await loadExtension();
    writeConfig({
      version: 1,
      provider: { name: "opencode-go", model: "kimi-k2.6" },
      agent: { name: "plan", maxIterations: 10, toolBudget: 6 },
      theme: { name: "default" },
    });
    const handler = pi.handlers.get("tool_call")![0]!;
    const result = await handler({ toolName: "write", input: { path: "/x", content: "y" } }, makeMockCtx());
    expect(result).toEqual({ block: true, reason: expect.stringContaining("read-only") });
  });

  it("blocks edit", async () => {
    const { pi } = await loadExtension();
    writeConfig({
      version: 1,
      provider: { name: "opencode-go", model: "kimi-k2.6" },
      agent: { name: "plan", maxIterations: 10, toolBudget: 6 },
      theme: { name: "default" },
    });
    const handler = pi.handlers.get("tool_call")![0]!;
    const result = await handler({ toolName: "edit", input: {} }, makeMockCtx());
    expect(result).toEqual({ block: true, reason: expect.stringContaining("read-only") });
  });

  it("allows safe bash (ls)", async () => {
    const { pi } = await loadExtension();
    writeConfig({
      version: 1,
      provider: { name: "opencode-go", model: "kimi-k2.6" },
      agent: { name: "plan", maxIterations: 10, toolBudget: 6 },
      theme: { name: "default" },
    });
    const handler = pi.handlers.get("tool_call")![0]!;
    const result = await handler({ toolName: "bash", input: { command: "ls /tmp" } }, makeMockCtx());
    expect(result).toBeUndefined();
  });

  it("does not block in build mode", async () => {
    const { pi } = await loadExtension();
    const handler = pi.handlers.get("tool_call")![0]!;
    const result = await handler({ toolName: "bash", input: { command: "rm -rf /tmp/x" } }, makeMockCtx());
    expect(result).toBeUndefined();
  });
});

describe("before_agent_start in plan mode", () => {
  it("injects plan-mode system prompt", async () => {
    const { pi } = await loadExtension();
    writeConfig({
      version: 1,
      provider: { name: "opencode-go", model: "kimi-k2.6" },
      agent: { name: "plan", maxIterations: 10, toolBudget: 6 },
      theme: { name: "default" },
    });
    const handler = pi.handlers.get("before_agent_start")![0]!;
    const result = await handler({}, makeMockCtx());
    expect(result.message).toBeDefined();
    expect(result.message.customType).toBe("pi-pro-plan-mode");
    expect(result.message.content).toContain("PLAN MODE ACTIVE");
    expect(result.message.display).toBe(false);
  });

  it("returns nothing in build mode", async () => {
    const { pi } = await loadExtension();
    const handler = pi.handlers.get("before_agent_start")![0]!;
    const result = await handler({}, makeMockCtx());
    expect(result).toBeUndefined();
  });
});

describe("agent_end / turn_end plan widget", () => {
  it("sets widget on agent_end when plan parsed", async () => {
    const { pi, ui } = await loadExtension();
    writeConfig({
      version: 1,
      provider: { name: "opencode-go", model: "kimi-k2.6" },
      agent: { name: "plan", maxIterations: 10, toolBudget: 6 },
      theme: { name: "default" },
    });
    const handler = pi.handlers.get("agent_end")![0]!;
    const text = "Plan:\n1. First\n2. Second\n\n[DONE:1]";
    await handler({ messages: [{ role: "assistant", content: text }] }, makeMockCtx({ ui }));
    expect(ui.widgets.has("pi-pro-plan")).toBe(true);
  });
});

describe(":mode command", () => {
  it("shows modes when no arg", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("mode")!;
    await cmd.handler("", makeMockCtx({ ui }));
    const notes = ui.notifies.map((n) => n.message);
    expect(notes.some((m) => m.includes("build"))).toBe(true);
    expect(notes.some((m) => m.includes("plan"))).toBe(true);
  });

  it("sets mode and applies active tools", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("mode")!;
    await cmd.handler("plan", makeMockCtx({ ui }));
    const cfg = JSON.parse(readFileSync(configPath(), "utf8"));
    expect(cfg.agent.name).toBe("plan");
    expect(pi.activeTools).toEqual(["read", "bash", "grep", "find", "ls", "questionnaire"]);
  });

  it("rejects unknown mode", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("mode")!;
    await cmd.handler("nope", makeMockCtx({ ui }));
    expect(ui.notifies.some((n) => n.type === "error")).toBe(true);
  });
});

describe(":plan command", () => {
  it("toggles build → plan", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("plan")!;
    await cmd.handler(undefined, makeMockCtx({ ui }));
    const cfg = JSON.parse(readFileSync(configPath(), "utf8"));
    expect(cfg.agent.name).toBe("plan");
  });

  it("toggles plan → build", async () => {
    writeConfig({
      version: 1,
      provider: { name: "opencode-go", model: "kimi-k2.6" },
      agent: { name: "plan", maxIterations: 10, toolBudget: 6 },
      theme: { name: "default" },
    });
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("plan")!;
    await cmd.handler(undefined, makeMockCtx({ ui }));
    const cfg = JSON.parse(readFileSync(configPath(), "utf8"));
    expect(cfg.agent.name).toBe("build");
  });
});

describe(":todos command", () => {
  it("shows empty list initially", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("todos")!;
    await cmd.handler(undefined, makeMockCtx({ ui }));
    expect(ui.notifies.some((n) => n.message.includes("no todos"))).toBe(true);
  });
});

describe(":config command", () => {
  it("shows config", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("config")!;
    await cmd.handler(undefined, makeMockCtx({ ui }));
    const note = ui.notifies.find((n) => n.message.includes("pi-pro config"));
    expect(note).toBeDefined();
    expect(note!.message).toContain("provider");
  });
});

describe(":doctor command", () => {
  it("shows system info", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("doctor")!;
    await cmd.handler(undefined, makeMockCtx({ ui }));
    const note = ui.notifies.find((n) => n.message.includes("pi-pro doctor"));
    expect(note).toBeDefined();
    expect(note!.message).toContain("provider");
    expect(note!.message).toContain("mode:");
  });

  it("reports env key status", async () => {
    process.env.OPENCODE_API_KEY = "sk-test-1234567890abcdef";
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("doctor")!;
    await cmd.handler(undefined, makeMockCtx({ ui }));
    const note = ui.notifies.find((n) => n.message.includes("api key"));
    expect(note).toBeDefined();
    expect(note!.message).toMatch(/sk-.*cdef/);
  });

  it("shows tool count", async () => {
    const { pi, ui } = await loadExtension();
    pi.getAllTools = () => [{ name: "a" }, { name: "b" }, { name: "c" }] as any;
    const cmd = pi.commands.get("doctor")!;
    await cmd.handler(undefined, makeMockCtx({ ui }));
    const note = ui.notifies.find((n) => n.message.includes("3 available"));
    expect(note).toBeDefined();
  });
});

describe(":theme command (delegates to pi-zentui)", () => {
  it("tells user pi-zentui owns theme", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("theme")!;
    await cmd.handler(undefined, makeMockCtx({ ui }));
    const note = ui.notifies.find((n) => n.message.includes("pi-zentui"));
    expect(note).toBeDefined();
  });

  it("ignores unknown arg silently", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("theme")!;
    await cmd.handler("nope", makeMockCtx({ ui }));
    const note = ui.notifies.find((n) => n.message.includes("pi-zentui"));
    expect(note).toBeDefined();
  });
});

describe(":login command", () => {
  it("writes key to auth.json with mode 0600", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("login")!;
    await cmd.handler("opencode-go sk-test-1234567890", makeMockCtx({ ui }));
    const authPath = join(getAuthPath(), "auth.json");
    const stat = statSync(authPath);
    expect(stat.mode & 0o777).toBe(0o600);
    const data = JSON.parse(readFileSync(authPath, "utf8"));
    expect(data["opencode-go"].key).toBe("sk-test-1234567890");
  });

  it("rejects missing provider", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("login")!;
    await cmd.handler("", makeMockCtx({ ui }));
    expect(ui.notifies.some((n) => n.type === "error" && n.message.includes("usage"))).toBe(true);
  });

  it("prompts via ctx.ui.input when key missing", async () => {
    const { pi, ui } = await loadExtension();
    ui.input = async () => "sk-prompted-key";
    const cmd = pi.commands.get("login")!;
    await cmd.handler("opencode-go", makeMockCtx({ ui }));
    const authPath = join(getAuthPath(), "auth.json");
    const data = JSON.parse(readFileSync(authPath, "utf8"));
    expect(data["opencode-go"].key).toBe("sk-prompted-key");
  });

  it("cancels on empty input", async () => {
    const { pi, ui } = await loadExtension();
    ui.input = async () => undefined;
    const cmd = pi.commands.get("login")!;
    await cmd.handler("opencode-go", makeMockCtx({ ui }));
    expect(ui.notifies.some((n) => n.message.includes("cancelled"))).toBe(true);
  });
});

describe("Tab shortcut two-way cycle", () => {
  it("build -> plan -> build restores all tools", async () => {
    const { pi, ui } = await loadExtension();
    const sc = pi.shortcuts.get("tab")!;
    pi.getAllTools = () => [{ name: "bash" }, { name: "read" }, { name: "write" }, { name: "edit" }, { name: "todo" }] as any;
    pi.handlers.get("session_start")![0]!(undefined, makeMockCtx({ ui }));

    await sc.handler(makeMockCtx({ ui }));
    expect(pi.activeTools).toEqual(["read", "bash", "grep", "find", "ls", "questionnaire"]);

    await sc.handler(makeMockCtx({ ui }));
    expect(pi.activeTools).toEqual(["bash", "read", "write", "edit", "todo"]);
  });

  it("clears plan widget when leaving plan mode", async () => {
    const { pi, ui } = await loadExtension();
    writeConfig({ version: 1, provider: { name: "opencode-go", model: "kimi-k2.6" }, agent: { name: "plan", maxIterations: 10, toolBudget: 6 }, theme: { name: "default" } });
    const sc = pi.shortcuts.get("tab")!;
    await sc.handler(makeMockCtx({ ui }));
    expect(ui.widgets.get("pi-pro-plan")).toBeUndefined();
  });
});

describe("plan widget lifecycle", () => {
  it("re-parses on new plan in same session", async () => {
    const { pi, ui } = await loadExtension();
    writeConfig({ version: 1, provider: { name: "opencode-go", model: "kimi-k2.6" }, agent: { name: "plan", maxIterations: 10, toolBudget: 6 }, theme: { name: "default" } });
    const handler = pi.handlers.get("agent_end")![0]!;
    await handler({ messages: [{ role: "assistant", content: "Plan:\n1. A\n2. B" }] }, makeMockCtx({ ui }));
    await handler({ messages: [{ role: "assistant", content: "Plan:\n1. New A\n2. New B" }] }, makeMockCtx({ ui }));
    const lines = ui.widgets.get("pi-pro-plan");
    expect(lines).toBeDefined();
    expect(lines!.join(" ")).toMatch(/New A|New B/);
  });

  it("does not re-parse on identical text", async () => {
    const { pi } = await loadExtension();
    writeConfig({ version: 1, provider: { name: "opencode-go", model: "kimi-k2.6" }, agent: { name: "plan", maxIterations: 10, toolBudget: 6 }, theme: { name: "default" } });
    const handler = pi.handlers.get("agent_end")![0]!;
    const text = "Plan:\n1. A\n2. B";
    const ui = makeMockUI();
    await handler({ messages: [{ role: "assistant", content: text }] }, makeMockCtx({ ui }));
    const callsAfter1 = (ui.widgets.get("pi-pro-plan")?.length ?? 0);
    await handler({ messages: [{ role: "assistant", content: text }] }, makeMockCtx({ ui }));
  });
});

describe(":memory-* commands", () => {
  it("add → list → search → clear flow", async () => {
    const { pi, ui } = await loadExtension();
    const add = pi.commands.get("memory-add")!;
    const list = pi.commands.get("memory-list")!;
    const search = pi.commands.get("memory-search")!;
    const clear = pi.commands.get("memory-clear")!;
    const ctx = makeMockCtx({ ui });

    await add.handler("Sid likes concise responses", ctx);
    await add.handler("OpenCode Go key in env OPENCODE_API_KEY", ctx);
    expect(ui.notifies.some((n) => n.message.includes("added"))).toBe(true);

    await list.handler(undefined, ctx);
    const listNote = ui.notifies.find((n) => n.message.includes("concise"));
    expect(listNote).toBeDefined();

    await search.handler("concise", ctx);
    const searchNote = ui.notifies.find((n) => n.message.includes("concise"));
    expect(searchNote).toBeDefined();

    await clear.handler(undefined, ctx);
    expect(ui.notifies.some((n) => n.message.includes("cleared"))).toBe(true);
  });

  it("rejects empty add", async () => {
    const { pi, ui } = await loadExtension();
    const add = pi.commands.get("memory-add")!;
    await add.handler("", makeMockCtx({ ui }));
    expect(ui.notifies.some((n) => n.type === "error" && n.message.includes("usage"))).toBe(true);
  });
});

describe(":btw command", () => {
  it("queues side question via sendUserMessage", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("btw")!;
    await cmd.handler("what year is it?", makeMockCtx({ ui }));
    expect(pi.sentMessages.some((m) => m.type === "user" && (m.content as string).includes("what year"))).toBe(true);
  });

  it("rejects empty arg", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("btw")!;
    await cmd.handler("", makeMockCtx({ ui }));
    expect(ui.notifies.some((n) => n.type === "error")).toBe(true);
  });
});

describe(":context command", () => {
  it("shows context usage", async () => {
    const { pi, ui } = await loadExtension();
    const cmd = pi.commands.get("context")!;
    await cmd.handler(undefined, makeMockCtx({ ui }));
    const note = ui.notifies.find((n) => n.message.includes("ctx:"));
    expect(note).toBeDefined();
  });
});

describe("Tab shortcut", () => {
  it("cycles mode", async () => {
    const { pi, ui } = await loadExtension();
    const sc = pi.shortcuts.get("tab")!;
    await sc.handler(makeMockCtx({ ui }));
    const cfg = JSON.parse(readFileSync(configPath(), "utf8"));
    expect(["build", "plan"]).toContain(cfg.agent.name);
  });
});

describe("todo tool", () => {
  it("list when empty", async () => {
    const { pi } = await loadExtension();
    const tool = pi.tools.get("todo")!;
    const result = await tool.execute("c1", { action: "list" }, undefined, undefined, makeMockCtx());
    expect(result.content[0].text).toContain("no todos");
    expect(result.details.action).toBe("list");
  });

  it("add → list → toggle → list flow", async () => {
    const { pi } = await loadExtension();
    const tool = pi.tools.get("todo")!;
    const ctx = makeMockCtx();

    const r1 = await tool.execute("c1", { action: "add", text: "task one" }, undefined, undefined, ctx);
    expect(r1.details.addedId).toBe(1);

    const r2 = await tool.execute("c2", { action: "add", text: "task two" }, undefined, undefined, ctx);
    expect(r2.details.addedId).toBe(2);

    const r3 = await tool.execute("c3", { action: "toggle", id: 1 }, undefined, undefined, ctx);
    expect(r3.details.action).toBe("toggle");

    const r4 = await tool.execute("c4", { action: "list" }, undefined, undefined, ctx);
    expect(r4.details.items.length).toBe(2);
    expect(r4.details.items.find((i: any) => i.id === 1)!.done).toBe(true);
    expect(r4.details.items.find((i: any) => i.id === 2)!.done).toBe(false);
  });

  it("add rejects empty text", async () => {
    const { pi } = await loadExtension();
    const tool = pi.tools.get("todo")!;
    const result = await tool.execute("c1", { action: "add", text: "" }, undefined, undefined, makeMockCtx());
    expect(result.details.error).toBeDefined();
  });

  it("toggle rejects missing id", async () => {
    const { pi } = await loadExtension();
    const tool = pi.tools.get("todo")!;
    const result = await tool.execute("c1", { action: "toggle" }, undefined, undefined, makeMockCtx());
    expect(result.details.error).toBe("id required");
  });

  it("toggle rejects unknown id", async () => {
    const { pi } = await loadExtension();
    const tool = pi.tools.get("todo")!;
    const result = await tool.execute("c1", { action: "toggle", id: 999 }, undefined, undefined, makeMockCtx());
    expect(result.details.error).toContain("999");
  });

  it("clear empties list", async () => {
    const { pi } = await loadExtension();
    const tool = pi.tools.get("todo")!;
    const ctx = makeMockCtx();
    await tool.execute("c1", { action: "add", text: "x" }, undefined, undefined, ctx);
    const r = await tool.execute("c2", { action: "clear" }, undefined, undefined, ctx);
    expect(r.details.items.length).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { Optimizer } from "../src/optimizer.js";
import type { TurnContext } from "../src/types.js";
import type { Message, Tool } from "@promyra/provider";

const basicTools: Tool[] = [
  { name: "read", description: "r", input_schema: { type: "object" } },
  { name: "edit", description: "e", input_schema: { type: "object" } },
];

const basicCtx = (overrides: Partial<TurnContext> = {}): TurnContext => ({
  systemPrompt: "You are a coding assistant.",
  tools: basicTools,
  history: [],
  userMessage: { role: "user", content: "Fix the auth bug." },
  mainModel: "claude-sonnet-4-5",
  provider: "anthropic",
  cacheKey: "session-1",
  ...overrides,
});

describe("Optimizer — static block assembly", () => {
  const sysText = (m: Message): string => typeof m.content === "string"
    ? m.content
    : m.content.map(b => b.type === "text" ? b.text : "").join("");

  it("assembles system + tools in static block", () => {
    const o = new Optimizer();
    const out = o.optimize(basicCtx());
    expect(out.messages[0].role).toBe("system");
    expect(sysText(out.messages[0])).toContain("coding assistant");
    expect(out.tools).toHaveLength(2);
  });

  it("includes repo map in system block when provided", () => {
    const o = new Optimizer();
    const out = o.optimize(basicCtx({ repoMap: "export function foo() {}" }));
    expect(out.hasRepoMap).toBe(true);
    expect(sysText(out.messages[0])).toContain("Repo map");
    expect(sysText(out.messages[0])).toContain("export function foo() {}");
  });

  it("excludes repo map when flag disabled", () => {
    const o = new Optimizer();
    const out = o.optimize(basicCtx({
      repoMap: "ignored",
      flags: { repoMap: false },
    }));
    expect(out.hasRepoMap).toBe(false);
  });

  it("preserves history and user message in dynamic block", () => {
    const o = new Optimizer();
    const history: Message[] = [
      { role: "user", content: "previous turn" },
      { role: "assistant", content: "previous answer" },
    ];
    const out = o.optimize(basicCtx({ history }));
    expect(out.messages).toHaveLength(4); // system + 2 history + user
    expect(out.messages[1].content).toBe("previous turn");
    expect(out.messages[2].content).toBe("previous answer");
    expect(out.messages[3].content).toBe("Fix the auth bug.");
  });
});

describe("Optimizer — cache breakpoints", () => {
  it("emits cache_control on system for Anthropic", () => {
    const o = new Optimizer();
    const out = o.optimize(basicCtx());
    const sys = out.messages[0];
    expect(Array.isArray(sys.content)).toBe(true);
    const blocks = sys.content as Array<{ cache_control?: unknown }>;
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("marks last tool as cacheable for Anthropic", () => {
    const o = new Optimizer();
    const out = o.optimize(basicCtx());
    const last = out.tools[out.tools.length - 1] as Tool & { __cacheBreakpoint?: unknown };
    expect(last.__cacheBreakpoint).toEqual({ kind: "tools" });
    const first = out.tools[0] as Tool & { __cacheBreakpoint?: unknown };
    expect(first.__cacheBreakpoint).toBeUndefined();
  });

  it("sets cacheHints.cacheKey for OpenAI", () => {
    const o = new Optimizer();
    const out = o.optimize(basicCtx({ provider: "openai", cacheKey: "session-X" }));
    expect(out.cacheHints.cacheKey).toBe("session-X");
    expect(out.cacheHints.cacheSystem).toBe(true);
  });

  it("no cache applied when flag disabled", () => {
    const o = new Optimizer();
    const out = o.optimize(basicCtx({ flags: { cache: false } }));
    expect(out.cacheHints.cacheSystem).toBeUndefined();
    const sys = out.messages[0];
    expect(typeof sys.content).toBe("string");
  });
});

describe("Optimizer — cascade routing", () => {
  it("populates cascadeMap for cheap tools", () => {
    const o = new Optimizer();
    const out = o.optimize(basicCtx({ provider: "anthropic", mainModel: "claude-sonnet-4-5" }));
    expect(out.cascadeMap["read"]).toBe("claude-haiku-4-5");
    expect(out.cascadeMap["edit"]).toBeUndefined();
  });

  it("empty cascadeMap when flag disabled", () => {
    const o = new Optimizer();
    const out = o.optimize(basicCtx({ flags: { cascade: false } }));
    expect(out.cascadeMap).toEqual({});
  });
});

describe("Optimizer — cost estimate", () => {
  it("estimates static block cost in USD", () => {
    const o = new Optimizer();
    const out = o.optimize(basicCtx());
    expect(out.costEstimate.inputTokens).toBeGreaterThan(0);
    expect(out.costEstimate.costUsd).toBeGreaterThan(0);
  });

  it("returns 0 for free/local models", () => {
    const o = new Optimizer();
    const out = o.optimize(basicCtx({ provider: "ollama", mainModel: "llama3" }));
    expect(out.costEstimate.costUsd).toBe(0);
  });
});

describe("Optimizer — tool model resolution", () => {
  it("resolves cheap tool to cascade model", () => {
    const o = new Optimizer();
    const m = o.resolveToolModel("grep", "claude-sonnet-4-5", "anthropic", { cache: true, repoMap: true, cascade: true, parallelTools: true, telemetry: true });
    expect(m).toBe("claude-haiku-4-5");
  });

  it("resolves main tool to main model", () => {
    const o = new Optimizer();
    const m = o.resolveToolModel("edit", "claude-sonnet-4-5", "anthropic", { cache: true, repoMap: true, cascade: true, parallelTools: true, telemetry: true });
    expect(m).toBe("claude-sonnet-4-5");
  });

  it("respects cascade=false flag", () => {
    const o = new Optimizer();
    const m = o.resolveToolModel("grep", "claude-sonnet-4-5", "anthropic", { cache: true, repoMap: true, cascade: false, parallelTools: true, telemetry: true });
    expect(m).toBe("claude-sonnet-4-5");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { PromptCache, applyAnthropicBreakpoints, applyOpenAIPrefixOrder, passthrough } from "../src/prompt-cache.js";
import type { Message, Tool } from "@promyra/provider";

describe("PromptCache — applyAnthropicBreakpoints", () => {
  it("returns messages unchanged when no breakpoints", () => {
    const msgs: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ];
    const { messages: out } = applyAnthropicBreakpoints(msgs, []);
    expect(out).toBe(msgs);
  });

  it("emits cache_control on last system block when system breakpoint set", () => {
    const msgs: Message[] = [
      { role: "system", content: "you are an assistant" },
      { role: "user", content: "hi" },
    ];
    const { messages: out } = applyAnthropicBreakpoints(msgs, [{ kind: "system" }]);
    expect(out[0].role).toBe("system");
    expect(Array.isArray(out[0].content)).toBe(true);
    const blocks = out[0].content as Array<{ type: string; text: string; cache_control?: unknown }>;
    expect(blocks[0].text).toBe("you are an assistant");
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("joins multiple system messages into one block with cache_control on last", () => {
    const msgs: Message[] = [
      { role: "system", content: "first" },
      { role: "system", content: "second" },
      { role: "user", content: "hi" },
    ];
    const { messages: out } = applyAnthropicBreakpoints(msgs, [{ kind: "system" }]);
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe("system");
    const blocks = out[0].content as Array<{ type: string; text: string; cache_control?: unknown }>;
    expect(blocks[0].text).toBe("first\n\nsecond");
    expect(blocks[blocks.length - 1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("marks the last tool as cacheable when tools breakpoint set", () => {
    const tools: Tool[] = [
      { name: "read", description: "r", input_schema: { type: "object" } },
      { name: "edit", description: "e", input_schema: { type: "object" } },
    ];
    const { tools: out } = applyAnthropicBreakpoints([], [], tools, [{ kind: "tools" }]);
    expect(out[0].__cacheBreakpoint).toBeUndefined();
    expect(out[1].__cacheBreakpoint).toEqual({ kind: "tools" });
  });

  it("no-op when tools breakpoint set but tools is empty", () => {
    const { tools: out } = applyAnthropicBreakpoints([], [], [], [{ kind: "tools" }]);
    expect(out).toEqual([]);
  });
});

describe("PromptCache — applyOpenAIPrefixOrder", () => {
  it("moves system messages to the front and returns in order", () => {
    const msgs: Message[] = [
      { role: "user", content: "hi" },
      { role: "system", content: "you are an assistant" },
      { role: "user", content: "again" },
    ];
    const out = applyOpenAIPrefixOrder(msgs, "session-1");
    expect(out[0].role).toBe("system");
    expect(out[1].role).toBe("user");
    expect(out[2].role).toBe("user");
  });

  it("no-ops when no system messages", () => {
    const msgs: Message[] = [{ role: "user", content: "hi" }];
    const out = applyOpenAIPrefixOrder(msgs);
    expect(out).toBe(msgs);
  });
});

describe("PromptCache — passthrough", () => {
  it("returns messages unchanged", () => {
    const msgs: Message[] = [{ role: "user", content: "x" }];
    expect(passthrough(msgs)).toBe(msgs);
  });
});

describe("PromptCache — stats tracking", () => {
  let cache: PromptCache;
  beforeEach(() => { cache = new PromptCache(); });

  it("starts at zero hits and misses", () => {
    const s = cache.stats();
    expect(s.hits).toBe(0);
    expect(s.misses).toBe(0);
    expect(s.hitRate).toBe(0);
  });

  it("records hits and misses with rolling rate", () => {
    cache.recordHit();
    cache.recordHit();
    cache.recordMiss();
    const s = cache.stats();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(s.hitRate).toBeCloseTo(2 / 3, 3);
  });

  it("tracks totalReads and totalWrites from token counts", () => {
    cache.recordMiss(100);
    cache.recordHit(80);
    const s = cache.stats();
    expect(s.totalWrites).toBe(100);
    expect(s.totalReads).toBe(80);
  });
});

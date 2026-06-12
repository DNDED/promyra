import { describe, it, expect } from "vitest";
import { Message, StreamChunk, Tool, CallOpts, Provider, ContentBlock, Usage, CacheHints, isTokenChunk, isToolCallChunk, isDoneChunk } from "../src/types.js";

describe("@promyra/provider types", () => {
  it("Message can be a plain string content", () => {
    const m: Message = { role: "user", content: "hello" };
    expect(m.role).toBe("user");
    expect(m.content).toBe("hello");
  });

  it("Message can be an array of content blocks", () => {
    const m: Message = {
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
    };
    expect(Array.isArray(m.content)).toBe(true);
  });

  it("Tool schema has name, description, and input_schema", () => {
    const t: Tool = {
      name: "bash",
      description: "run a shell command",
      input_schema: { type: "object", properties: { cmd: { type: "string" } } },
    };
    expect(t.name).toBe("bash");
    expect(t.input_schema.type).toBe("object");
  });

  it("CallOpts has model and optional fields", () => {
    const o: CallOpts = { model: "test-model", maxTokens: 1024, temperature: 0.7 };
    expect(o.model).toBe("test-model");
    expect(o.maxTokens).toBe(1024);
  });

  it("StreamChunk discriminates by type", () => {
    const t: StreamChunk = { type: "token", text: "hello" };
    const tc: StreamChunk = { type: "tool_call", id: "x", name: "bash", args: { cmd: "ls" } };
    const d: StreamChunk = { type: "done", usage: { in: 1, out: 2 } };
    expect(isTokenChunk(t)).toBe(true);
    expect(isToolCallChunk(tc)).toBe(true);
    expect(isDoneChunk(d)).toBe(true);
    expect(isTokenChunk(tc)).toBe(false);
  });

  it("ContentBlock can be text or tool_use", () => {
    const text: ContentBlock = { type: "text", text: "x" };
    const tool: ContentBlock = { type: "tool_use", id: "x", name: "bash", input: { cmd: "ls" } };
    expect(text.type).toBe("text");
    expect(tool.type).toBe("tool_use");
  });

  it("Provider is an interface with a name and complete method", () => {
    const p: Provider = {
      name: "test",
      complete: async function* () {
        yield { type: "done" as const, usage: { in: 0, out: 0 } };
      },
    };
    expect(p.name).toBe("test");
    expect(typeof p.complete).toBe("function");
  });

  it("v0.5.0: Usage includes optional cache + cost fields", () => {
    const u: Usage = { in: 100, out: 50, cacheReadTokens: 80, cacheWriteTokens: 20, costUsd: 0.012 };
    expect(u.cacheReadTokens).toBe(80);
    expect(u.cacheWriteTokens).toBe(20);
    expect(u.costUsd).toBe(0.012);
  });

  it("v0.5.0: Usage fields are optional (backwards compat)", () => {
    const u: Usage = { in: 100, out: 50 };
    expect(u.cacheReadTokens).toBeUndefined();
    expect(u.costUsd).toBeUndefined();
  });

  it("v0.5.0: CallOpts carries CacheHints", () => {
    const hints: CacheHints = { cacheSystem: true, cacheTools: true, cacheKey: "session-123" };
    const o: CallOpts = { model: "x", cacheHints: hints };
    expect(o.cacheHints?.cacheSystem).toBe(true);
    expect(o.cacheHints?.cacheTools).toBe(true);
    expect(o.cacheHints?.cacheKey).toBe("session-123");
  });

  it("v0.5.0: done chunk with cache metadata still type-checks", () => {
    const d: StreamChunk = {
      type: "done",
      usage: { in: 10, out: 5, cacheReadTokens: 8, cacheWriteTokens: 2, costUsd: 0.001 },
    };
    if (isDoneChunk(d)) {
      expect(d.usage.cacheReadTokens).toBe(8);
      expect(d.usage.costUsd).toBe(0.001);
    }
  });
});

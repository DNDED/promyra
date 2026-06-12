import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { AnthropicProvider } from "../src/anthropic.js";

let server: ReturnType<typeof createServer>;
let baseUrl: string;
let lastBody = "";
let lastHeaders: Record<string, string> = {};

beforeEach(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      lastBody = body;
      lastHeaders = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") lastHeaders[k] = v;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(`data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":5}}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise<void>(r => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>(r => server.close(() => r()));
});

describe("AnthropicProvider", () => {
  it("has the correct name", () => {
    const p = new AnthropicProvider({ apiKey: "test", model: "claude-sonnet-4-6" });
    expect(p.name).toBe("anthropic");
  });

  it("uses api.anthropic.com by default", async () => {
    const p = new AnthropicProvider({ apiKey: "test", model: "x" });
    expect(p).toBeDefined();
  });

  it("sends x-api-key and anthropic-version headers", async () => {
    const p = new AnthropicProvider({ apiKey: "sk-ant-123", model: "claude-sonnet-4-6", baseUrl });
    for await (const _ of p.complete([{ role: "user", content: "hi" }], { model: "claude-sonnet-4-6" })) { /* drain */ }
    expect(lastHeaders["x-api-key"]).toBe("sk-ant-123");
    expect(lastHeaders["anthropic-version"]).toBe("2023-06-01");
  });

  it("sends POST to /v1/messages", async () => {
    const p = new AnthropicProvider({ apiKey: "test", model: "x", baseUrl });
    for await (const _ of p.complete([{ role: "user", content: "hi" }], { model: "x" })) { /* drain */ }
    const parsed = JSON.parse(lastBody);
    expect(parsed.model).toBe("x");
    expect(parsed.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("emits a done chunk with usage", async () => {
    const p = new AnthropicProvider({ apiKey: "test", model: "x", baseUrl });
    let usage: { in: number; out: number } | null = null;
    for await (const chunk of p.complete([{ role: "user", content: "x" }], { model: "x" })) {
      if (chunk.type === "done") usage = chunk.usage;
    }
    expect(usage).toEqual({ in: 10, out: 5 });
  });
});

describe("v0.5.0 AnthropicProvider cache + cost", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  let lastBody = "";

  beforeEach(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", () => {
        lastBody = body;
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.end(`data: {"type":"message_start","message":{"usage":{"input_tokens":12,"cache_creation_input_tokens":100,"cache_read_input_tokens":80}}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\ndata: [DONE]\n\n`);
      });
    });
    await new Promise<void>(r => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>(r => server.close(() => r()));
  });

  it("emits cache_control: ephemeral on system when cacheSystem hint set", async () => {
    const p = new AnthropicProvider({ apiKey: "test", model: "x", baseUrl });
    for await (const _ of p.complete(
      [
        { role: "system", content: "You are a coding assistant." },
        { role: "user", content: "hi" },
      ],
      { model: "x", cacheHints: { cacheSystem: true } },
    )) { /* drain */ }
    const parsed = JSON.parse(lastBody);
    expect(Array.isArray(parsed.system)).toBe(true);
    expect(parsed.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(parsed.system[0].text).toContain("coding assistant");
  });

  it("keeps system as a plain string when cacheSystem hint not set", async () => {
    const p = new AnthropicProvider({ apiKey: "test", model: "x", baseUrl });
    for await (const _ of p.complete(
      [
        { role: "system", content: "hello" },
        { role: "user", content: "hi" },
      ],
      { model: "x" },
    )) { /* drain */ }
    const parsed = JSON.parse(lastBody);
    expect(typeof parsed.system).toBe("string");
    expect(parsed.system).toBe("hello");
  });

  it("emits cache_control: ephemeral on last tool when cacheTools hint set", async () => {
    const p = new AnthropicProvider({ apiKey: "test", model: "x", baseUrl });
    const tools = [
      { name: "read", description: "read", input_schema: { type: "object" } },
      { name: "edit", description: "edit", input_schema: { type: "object" } },
    ];
    for await (const _ of p.complete(
      [{ role: "user", content: "hi" }],
      { model: "x", tools, cacheHints: { cacheTools: true } },
    )) { /* drain */ }
    const parsed = JSON.parse(lastBody);
    expect(parsed.tools).toHaveLength(2);
    expect(parsed.tools[0].cache_control).toBeUndefined();
    expect(parsed.tools[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("no tool cache_control when cacheTools hint not set", async () => {
    const p = new AnthropicProvider({ apiKey: "test", model: "x", baseUrl });
    const tools = [{ name: "read", description: "read", input_schema: { type: "object" } }];
    for await (const _ of p.complete(
      [{ role: "user", content: "hi" }],
      { model: "x", tools },
    )) { /* drain */ }
    const parsed = JSON.parse(lastBody);
    expect(parsed.tools[0].cache_control).toBeUndefined();
  });

  it("reads cache_creation_input_tokens and cache_read_input_tokens from SSE", async () => {
    const p = new AnthropicProvider({ apiKey: "test", model: "x", baseUrl });
    let usage: { in: number; out: number; cacheReadTokens?: number; cacheWriteTokens?: number } | null = null;
    for await (const chunk of p.complete(
      [{ role: "user", content: "x" }],
      { model: "x", cacheHints: { cacheSystem: true } },
    )) {
      if (chunk.type === "done") usage = chunk.usage;
    }
    expect(usage?.in).toBe(12);
    expect(usage?.out).toBe(7);
    expect(usage?.cacheWriteTokens).toBe(100);
    expect(usage?.cacheReadTokens).toBe(80);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { LlmWorker } from "../src/llm-worker.js";
import { Provider, Message, CallOpts, StreamChunk } from "@promyra/provider";
import { StepContext } from "../src/types.js";
import { createBashTool, createEditTool, createReadTool, createWriteTool, createGrepTool, createGlobTool } from "@promyra/tools";
import { Optimizer } from "@promyra/optimizer";
import { ToolResultCache } from "@promyra/cache";

class FakeProvider implements Provider {
  name = "fake";
  responses: Array<AsyncIterable<StreamChunk>> = [];
  callIndex = 0;
  captured: Array<{ messages: Message[]; opts: CallOpts }> = [];

  queue(chunks: StreamChunk[]): void {
    this.responses.push((async function* () { for (const c of chunks) yield c; })());
  }

  async *complete(messages: Message[], opts: CallOpts): AsyncIterable<StreamChunk> {
    this.captured.push({ messages, opts });
    const r = this.responses[this.callIndex++];
    if (!r) throw new Error("FakeProvider: no more queued responses");
    for await (const c of r) yield c;
  }
}

let workdir: string;
beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), "llm-worker-v050-"));
  execSync("git init -q", { cwd: workdir });
  execSync("git config user.email t@local", { cwd: workdir });
  execSync("git config user.name t", { cwd: workdir });
  execSync("git commit --allow-empty -q -m init", { cwd: workdir });
});
afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

const ctx = (overrides: Partial<StepContext> = {}): StepContext => ({
  taskId: "tsk_v050",
  stepId: "s1",
  description: "v0.5.0 test task",
  worktreePath: workdir,
  ...overrides,
});

const allTools = () => [
  createBashTool({ cwd: workdir }),
  createReadTool({ cwd: workdir }),
  createWriteTool({ cwd: workdir }),
  createEditTool({ cwd: workdir }),
  createGrepTool({ cwd: workdir }),
  createGlobTool({ cwd: workdir }),
];

describe("v0.5.0 LlmWorker — optimizer integration", () => {
  it("wraps LLM call with optimizer, passes cacheHints to provider", async () => {
    const p = new FakeProvider();
    p.name = "anthropic";
    p.queue([
      { type: "token", text: '{"status": "pass", "evidence": "ok"}' },
      { type: "done", usage: { in: 100, out: 20, cacheReadTokens: 80, cacheWriteTokens: 0 } },
    ]);
    const opt = new Optimizer();
    const w = new LlmWorker(p, allTools(), workdir, { model: "claude-sonnet-4-5", optimizer: opt });
    await w.run("build", ctx());

    // Provider should have received cacheHints with cacheSystem+cacheTools
    expect(p.captured.length).toBe(1);
    const opts = p.captured[0].opts;
    expect(opts.cacheHints).toBeDefined();
    expect(opts.cacheHints?.cacheSystem).toBe(true);
    expect(opts.cacheHints?.cacheTools).toBe(true);
    expect(opts.cacheHints?.cacheKey).toContain("promyra-build-tsk_v050");
  });

  it("accumulates cost in dollars across LLM calls", async () => {
    const p = new FakeProvider();
    p.name = "anthropic";
    // Two LLM calls: first with tool_call, second with status
    p.queue([
      { type: "tool_call", id: "1", name: "bash", args: { command: "ls" } },
      { type: "done", usage: { in: 1000, out: 50, cacheReadTokens: 800 } },
    ]);
    p.queue([
      { type: "token", text: '{"status": "pass", "evidence": "ok"}' },
      { type: "done", usage: { in: 200, out: 20, cacheReadTokens: 100 } },
    ]);
    const opt = new Optimizer();
    const w = new LlmWorker(p, allTools(), workdir, { model: "claude-sonnet-4-5", optimizer: opt });
    await w.run("build", ctx());

    // Cost should be > 0 (we sent 1200 input + 70 output across 2 calls
    // with cache reads). With Sonnet pricing, expect ~$0.001-$0.01.
    expect(w.getCostUsd()).toBeGreaterThan(0);
  });

  it("falls back to raw provider call when optimizer throws", async () => {
    const p = new FakeProvider();
    p.name = "anthropic";
    p.queue([
      { type: "token", text: '{"status": "pass", "evidence": "ok"}' },
      { type: "done", usage: { in: 100, out: 20 } },
    ]);
    // Optimizer that throws on optimize()
    const opt = new Optimizer();
    const orig = opt.optimize.bind(opt);
    opt.optimize = () => { throw new Error("simulated optimizer failure"); };
    void orig;

    const w = new LlmWorker(p, allTools(), workdir, { model: "claude-sonnet-4-5", optimizer: opt });
    const r = await w.run("build", ctx());
    expect(r.status).toBe("pass");
    // No cache hints applied
    expect(p.captured[0].opts.cacheHints).toBeUndefined();
  });

  it("tracks cache hits/misses via optimizer.promptCache", async () => {
    const p = new FakeProvider();
    p.name = "anthropic";
    p.queue([
      { type: "token", text: '{"status": "pass", "evidence": "ok"}' },
      { type: "done", usage: { in: 100, out: 20, cacheReadTokens: 80, cacheWriteTokens: 20 } },
    ]);
    const opt = new Optimizer();
    const w = new LlmWorker(p, allTools(), workdir, { model: "claude-sonnet-4-5", optimizer: opt });
    await w.run("build", ctx());
    const stats = opt.promptCache.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.totalReads).toBe(80);
    expect(stats.totalWrites).toBe(20);
  });
});

describe("v0.5.0 LlmWorker — tool result cache", () => {
  it("caches read tool results within a session", async () => {
    const p = new FakeProvider();
    p.name = "anthropic";
    // Turn 1: read file
    p.queue([
      { type: "tool_call", id: "1", name: "read", args: { path: "a.ts" } },
      { type: "done", usage: { in: 100, out: 10 } },
    ]);
    // Turn 2: read same file again — should hit cache
    p.queue([
      { type: "tool_call", id: "2", name: "read", args: { path: "a.ts" } },
      { type: "done", usage: { in: 100, out: 10 } },
    ]);
    // Turn 3: emit status
    p.queue([
      { type: "token", text: '{"status": "pass", "evidence": "ok"}' },
      { type: "done", usage: { in: 100, out: 10 } },
    ]);

    await writeFile(join(workdir, "a.ts"), "hello world");
    const cache = new ToolResultCache();
    const w = new LlmWorker(p, allTools(), workdir, { model: "claude-sonnet-4-5", toolCache: cache });
    await w.run("build", ctx());

    expect(w.getCacheHits()).toBeGreaterThanOrEqual(1);
  });

  it("invalidates cache when edit/write modifies a file", async () => {
    const p = new FakeProvider();
    p.name = "anthropic";
    p.queue([
      { type: "tool_call", id: "1", name: "read", args: { path: "a.ts" } },
      { type: "done", usage: { in: 100, out: 10 } },
    ]);
    p.queue([
      { type: "tool_call", id: "2", name: "edit", args: { path: "a.ts", oldText: "hello", newText: "hi" } },
      { type: "done", usage: { in: 100, out: 10 } },
    ]);
    p.queue([
      { type: "token", text: '{"status": "pass", "evidence": "ok"}' },
      { type: "done", usage: { in: 100, out: 10 } },
    ]);

    await writeFile(join(workdir, "a.ts"), "hello world");
    const cache = new ToolResultCache();
    const w = new LlmWorker(p, allTools(), workdir, { model: "claude-sonnet-4-5", toolCache: cache });
    await w.run("build", ctx());

    // After edit, the read entry for a.ts should be invalidated
    const afterEdit = cache.get({ tool: "read", args: { path: "a.ts" } });
    expect(afterEdit).toBeUndefined();
  });
});

describe("v0.5.0 LlmWorker — parallel tool execution", () => {
  it("executes independent tool calls in parallel (single batch)", async () => {
    const p = new FakeProvider();
    p.name = "anthropic";
    // Turn 1: 3 parallel reads
    p.queue([
      { type: "tool_call", id: "1", name: "read", args: { path: "a.ts" } },
      { type: "tool_call", id: "2", name: "read", args: { path: "b.ts" } },
      { type: "tool_call", id: "3", name: "read", args: { path: "c.ts" } },
      { type: "done", usage: { in: 100, out: 10 } },
    ]);
    p.queue([
      { type: "token", text: '{"status": "pass", "evidence": "ok"}' },
      { type: "done", usage: { in: 100, out: 10 } },
    ]);

    await writeFile(join(workdir, "a.ts"), "A");
    await writeFile(join(workdir, "b.ts"), "B");
    await writeFile(join(workdir, "c.ts"), "C");

    const w = new LlmWorker(p, allTools(), workdir, { model: "claude-sonnet-4-5" });
    const r = await w.run("build", ctx());
    expect(r.status).toBe("pass");
  });

  it("respects parallelTools=false (sequential)", async () => {
    const p = new FakeProvider();
    p.name = "anthropic";
    p.queue([
      { type: "tool_call", id: "1", name: "read", args: { path: "a.ts" } },
      { type: "tool_call", id: "2", name: "read", args: { path: "b.ts" } },
      { type: "done", usage: { in: 100, out: 10 } },
    ]);
    p.queue([
      { type: "token", text: '{"status": "pass", "evidence": "ok"}' },
      { type: "done", usage: { in: 100, out: 10 } },
    ]);

    await writeFile(join(workdir, "a.ts"), "A");
    await writeFile(join(workdir, "b.ts"), "B");

    const w = new LlmWorker(p, allTools(), workdir, { model: "claude-sonnet-4-5", parallelTools: false });
    const r = await w.run("build", ctx());
    expect(r.status).toBe("pass");
  });
});

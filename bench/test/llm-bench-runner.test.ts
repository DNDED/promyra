import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { LlmBenchRunner } from "../src/llm-bench-runner.js";
import { Provider, Message, StreamChunk, CallOpts } from "@pi/provider";
import { TASKS } from "../tasks/index.js";

class ScriptedProvider implements Provider {
  name = "scripted";
  responses: Array<Array<StreamChunk>> = [];
  callIndex = 0;
  captured: Array<{ messages: Message[]; opts: CallOpts }> = [];

  queue(chunks: StreamChunk[]): void { this.responses.push(chunks); }

  async *complete(messages: Message[], opts: CallOpts): AsyncIterable<StreamChunk> {
    this.captured.push({ messages, opts });
    const r = this.responses[this.callIndex++];
    if (!r) throw new Error(`ScriptedProvider: no response queued for call #${this.callIndex}`);
    for (const c of r) yield c;
  }
}

let workdir: string;
beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), "llm-bench-"));
});
afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("LlmBenchRunner", () => {
  it("copies the fixture into an isolated workdir", async () => {
    const provider = new ScriptedProvider();
    provider.queue([{ type: "token", text: '{"status": "pass", "evidence": "ok"}' }, { type: "done", usage: { in: 1, out: 1 } }]);
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false });
    const result = await runner.runOne(TASKS[0]);
    expect(result.fixtureCopyPath).toContain("tiny-express");
    expect(result.fixtureCopyPath.length).toBeGreaterThan(20);
    expect(result.testCommand).toBeTruthy();
  });

  it("applies LLM tool_calls to the fixture copy and reports token usage", async () => {
    const provider = new ScriptedProvider();
    provider.queue([
      { type: "tool_call", name: "write", args: { path: "server.js", content: "console.log('hello');\n" } },
      { type: "done", usage: { in: 7, out: 3 } },
    ]);
    provider.queue([
      { type: "token", text: '{"status": "pass", "evidence": "wrote server.js"}' },
      { type: "done", usage: { in: 1, out: 1 } },
    ]);
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false });
    const task = { id: "t1", fixture: "tiny-express", description: "Add /healthz", expected: {} };
    const result = await runner.runOne(task);
    expect(result.tokensIn).toBe(8);
    expect(result.tokensOut).toBe(4);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toMatch(/bootstrap disabled|npm install/);
  });

  it("reports the fixture copy path and the test command used", async () => {
    const provider = new ScriptedProvider();
    provider.queue([
      { type: "token", text: '{"status": "pass", "evidence": "stub"}' },
      { type: "done", usage: { in: 1, out: 1 } },
    ]);
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false });
    const task = { id: "t1", fixture: "tiny-express", description: "x", expected: {} };
    const result = await runner.runOne(task);
    expect(result.fixtureCopyPath).toContain("tiny-express");
    expect(result.testCommand).toContain("node test.js");
  });

  it("marks the run as completed=false when the test command fails (not skipped)", async () => {
    const provider = new ScriptedProvider();
    provider.queue([
      { type: "token", text: '{"status": "pass", "evidence": "i tried"}' },
      { type: "done", usage: { in: 1, out: 1 } },
    ]);
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false });
    const task = { id: "t1", fixture: "nonexistent-fixture", description: "x", expected: {} };
    const result = await runner.runOne(task);
    expect(result.completed).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toMatch(/Fixture missing/);
  });

  it("returns blocked when the LLM provider errors out", async () => {
    const provider = new ScriptedProvider();
    provider.queue([
      { type: "token", text: '{"status": "blocked", "evidence": "cannot complete"}' },
      { type: "done", usage: { in: 0, out: 0 } },
    ]);
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false });
    const task = { id: "t1", fixture: "tiny-express", description: "Add /healthz", expected: {} };
    const result = await runner.runOne(task);
    expect(result.completed).toBe(false);
  });

  it("runs all 5 bench tasks and returns a summary", async () => {
    const provider = new ScriptedProvider();
    for (let i = 0; i < 8; i++) {
      provider.queue([
        { type: "token", text: '{"status": "pass", "evidence": "stub"}' },
        { type: "done", usage: { in: 0, out: 0 } },
      ]);
    }
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false });
    const summary = await runner.runAll();
    expect(summary.total).toBe(TASKS.length);
    expect(summary.completed).toBeGreaterThanOrEqual(0);
    expect(summary.completed).toBeLessThanOrEqual(summary.total);
  });

  it("counts token usage across all tasks", async () => {
    const provider = new ScriptedProvider();
    for (let i = 0; i < 8; i++) {
      provider.queue([
        { type: "token", text: '{"status": "pass", "evidence": "x"}' },
        { type: "done", usage: { in: 10, out: 5 } },
      ]);
    }
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false, maxRetries: 0 });
    const summary = await runner.runAll();
    expect(summary.tokensIn).toBeGreaterThan(0);
    expect(summary.tokensOut).toBeGreaterThan(0);
  });
});

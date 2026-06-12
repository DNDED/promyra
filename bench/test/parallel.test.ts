import { describe, it, expect } from "vitest";
import { LlmBenchRunner } from "../src/llm-bench-runner.js";
import { Provider, Message, StreamChunk, CallOpts } from "@pi/provider";

class ScriptedProvider implements Provider {
  name = "scripted";
  responses: StreamChunk[][] = [];
  callIndex = 0;
  captured: Array<{ messages: Message[]; opts: CallOpts; ts: number }> = [];
  private delayMs = 0;

  setDelay(ms: number): void { this.delayMs = ms; }

  queue(chunks: StreamChunk[]): void { this.responses.push(chunks); }

  async *complete(messages: Message[], opts: CallOpts): AsyncIterable<StreamChunk> {
    this.captured.push({ messages, opts, ts: Date.now() });
    if (this.delayMs > 0) await new Promise(r => setTimeout(r, this.delayMs));
    const r = this.responses[this.callIndex++];
    if (!r) throw new Error("no more responses");
    for (const c of r) yield c;
  }
}

describe("LlmBenchRunner.runAllParallel", () => {
  it("runs all tasks in parallel, not sequentially", async () => {
    const { TASKS } = await import("../tasks/index.js");
    const provider = new ScriptedProvider();
    provider.setDelay(100);
    for (let i = 0; i < TASKS.length; i++) {
      provider.queue([
        { type: "token", text: '{"status": "pass", "evidence": "x"}' },
        { type: "done", usage: { in: 0, out: 0 } },
      ]);
    }
    const runner = new LlmBenchRunner(provider, { workspaceRoot: "/tmp/pi-pro-bench-parallel-" + Date.now(), bootstrapDeps: false, maxRetries: 0 });
    const start = Date.now();
    const summary = await runner.runAllParallel();
    const elapsed = Date.now() - start;
    expect(summary.total).toBe(TASKS.length);
    expect(elapsed).toBeLessThan(3000);
  });

  it("returns the same shape as runAll", async () => {
    const provider = new ScriptedProvider();
    for (let i = 0; i < 3; i++) {
      provider.queue([
        { type: "token", text: '{"status": "pass", "evidence": "x"}' },
        { type: "done", usage: { in: 5, out: 2 } },
      ]);
    }
    const runner = new LlmBenchRunner(provider, { workspaceRoot: "/tmp/pi-pro-bench-parallel-shape-" + Date.now(), bootstrapDeps: false, maxRetries: 0 });
    const summary = await runner.runAllParallel((t) => t.id === "add-healthz" || t.id === "refactor-helper" || t.id === "fix-bug-auth");
    expect(summary.tokensIn).toBeGreaterThan(0);
    expect(summary.tokensOut).toBeGreaterThan(0);
    expect(summary.results).toHaveLength(3);
  });
});

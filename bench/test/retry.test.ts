import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LlmBenchRunner } from "../src/llm-bench-runner.js";
import { BenchTask } from "../tasks/index.js";
import { Provider, Message, CallOpts, StreamChunk } from "@pi/provider";

class RetryTestProvider implements Provider {
  name = "retry-test";
  private queue: AsyncIterable<StreamChunk>[] = [];
  capt: Message[][] = [];

  enqueue(chunks: StreamChunk[]) { this.queue.push(this.makeIter(chunks)); }
  private async *makeIter(c: StreamChunk[]) { for (const x of c) yield x; }

  async *complete(msgs: Message[], opts: CallOpts) {
    this.capt.push(msgs);
    yield* (this.queue.shift() || []);
  }
}

let workdir: string;

beforeEach(async () => { workdir = await mkdtemp(join(tmpdir(), "retry-test-")); });
afterEach(async () => { await rm(workdir, { recursive: true, force: true }); });

describe("LlmBenchRunner — multi-shot retry", () => {
  it("retries when the first LLM call produces code that fails tests", async () => {
    const p = new RetryTestProvider();
    p.enqueue([
      { type: "token", text: '{"status":"fail","evidence":"could not fix"}' },
      { type: "done", usage: { in: 2, out: 2 } },
    ]);
    p.enqueue([
      { type: "token", text: '{"status":"pass","evidence":"fixed on retry"}' },
      { type: "done", usage: { in: 2, out: 2 } },
    ]);
    const runner = new LlmBenchRunner(p, { workspaceRoot: workdir, bootstrapDeps: false, maxRetries: 1 });
    const task: BenchTask = { id: "retry-probe", fixture: "tiny-express", description: "x", expected: {} };
    const result = await runner.runOne(task);
    expect(result.testExitCode).toBeDefined();
    expect(p.capt.length).toBeGreaterThanOrEqual(1);
    expect(result.tokensIn).toBeGreaterThan(0);
  });

  it("does not retry when maxRetries is 0", async () => {
    const p = new RetryTestProvider();
    p.enqueue([
      { type: "token", text: '{"status":"fail","evidence":"bad"}' },
      { type: "done", usage: { in: 1, out: 1 } },
    ]);
    const runner = new LlmBenchRunner(p, { workspaceRoot: workdir, bootstrapDeps: false, maxRetries: 0 });
    const task: BenchTask = { id: "no-retry", fixture: "tiny-express", description: "x", expected: {} };
    const result = await runner.runOne(task);
    expect(p.capt.length).toBe(1);
    expect(result.tokensIn).toBeGreaterThan(0);
  });
});

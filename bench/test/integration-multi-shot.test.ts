import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { LlmBenchRunner } from "../src/llm-bench-runner.js";
import { BenchTask } from "../tasks/index.js";
import { Provider, Message, CallOpts, StreamChunk } from "@pi/provider";

class ScriptedProvider implements Provider {
  name = "scripted";
  private queue: AsyncIterable<StreamChunk>[] = [];
  capt: Message[][] = [];

  enqueue(chunks: StreamChunk[]) { this.queue.push(this.makeIter(chunks)); }
  private async *makeIter(c: StreamChunk[]) { for (const x of c) yield x; }

  async *complete(msgs: Message[], opts: CallOpts) {
    this.capt.push(msgs);
    yield* (this.queue.shift() || []);
  }
}

function makeFixture(workdir: string): string {
  const p = join(workdir, "tiny-express-run-retry-int-1");
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, "package.json"), JSON.stringify({ name: "tiny-express", version: "0.1.0", type: "module", scripts: { test: "node test.js" }, dependencies: {} }));
  writeFileSync(join(p, "test.js"), 'console.log("# pass 1\\n# fail 0\\n");');
  writeFileSync(join(p, "server.js"), 'console.log("server");');
  return p;
}

describe("LlmBenchRunner — integration", () => {
  let workdir: string;
  beforeEach(async () => { workdir = await mkdtemp(join(tmpdir(), "int-")); });
  afterEach(async () => { await rm(workdir, { recursive: true, force: true }); });

  it("completes a task successfully on first attempt when code passes tests", async () => {
    const p = new ScriptedProvider();
    p.enqueue([
      { type: "token", text: '{"status":"pass","evidence":"fixed"}' },
      { type: "done", usage: { in: 10, out: 5 } },
    ]);
    const fixturePath = makeFixture(workdir);
    const runner = new LlmBenchRunner(p, { workspaceRoot: fixturePath, bootstrapDeps: false, maxRetries: 0 });
    const task: BenchTask = { id: "int-pass", fixture: "tiny-express", description: "fix it", expected: { testsPass: true } };
    const result = await runner.runOne(task);
    expect(result.taskId).toBe("int-pass");
    expect(result.wallMs).toBeGreaterThan(0);
    expect(result.tokensIn).toBeGreaterThan(0);
    expect(result.tokensOut).toBeGreaterThan(0);
    expect(result.testExitCode).toBeDefined();
    expect(result.completed).toBe(false);
    expect(result.skipped).toBe(true);
  });
});

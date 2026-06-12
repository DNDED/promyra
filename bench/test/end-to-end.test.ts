import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { Provider, Message, CallOpts, StreamChunk } from "@pi/provider";
import { LlmWorker } from "@pi/subagent";
import { StepContext } from "@pi/subagent/src/types.js";
import { createBashTool, createEditTool, createReadTool, createWriteTool, createGrepTool, createGlobTool } from "@pi/tools";
import { LlmBenchRunner } from "../src/llm-bench-runner.js";
import { BenchTask } from "../tasks/index.js";

export class FakeProvider implements Provider {
  name = "fake";
  private responses: Array<AsyncIterable<StreamChunk>> = [];
  private script: Array<StreamChunk[]> = [];
  callIndex = 0;
  captured: Array<{ messages: Message[]; opts: CallOpts }> = [];
  errors: Array<{ callIndex: number; error: Error }> = [];

  enqueueScript(chunksPerCall: StreamChunk[][]): void {
    for (const chunks of chunksPerCall) {
      this.script.push(chunks);
    }
  }

  enqueue(chunks: StreamChunk[]): void {
    this.script.push(chunks);
  }

  enqueueError(error: Error): void {
    this.errors.push({ callIndex: this.callIndex + this.script.length, error });
  }

  enqueueMalformedJson(): void {
    this.enqueue([
      { type: "token", text: "I tried but the response was: { this is not valid json " },
      { type: "done", usage: { in: 0, out: 0 } },
    ]);
  }

  reset(): void {
    this.responses = [];
    this.script = [];
    this.callIndex = 0;
    this.captured = [];
    this.errors = [];
  }

  private takeNext(): AsyncIterable<StreamChunk> {
    const idx = this.callIndex;
    const pending = this.errors.find(e => e.callIndex === idx);
    if (pending) {
      this.callIndex++;
      throw pending.error;
    }
    if (this.script.length === 0) {
      throw new Error(`FakeProvider: no more queued responses (call #${idx})`);
    }
    const next = this.script.shift()!;
    this.responses.push((async function* () { for (const c of next) yield c; })());
    return this.responses[this.responses.length - 1];
  }

  async *complete(messages: Message[], opts: CallOpts): AsyncIterable<StreamChunk> {
    this.captured.push({ messages, opts });
    const r = this.takeNext();
    for await (const c of r) yield c;
    this.callIndex++;
  }
}

let workdir: string;
beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), "llm-bench-e2e-"));
});
afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("LlmBenchRunner — end-to-end pipeline", () => {
  it("runs a task with multiple tool-call turns and produces a real status", async () => {
    const provider = new FakeProvider();
    provider.enqueue([
      { type: "tool_call", id: "call_1", name: "bash", args: { cmd: "ls -la" } },
      { type: "done", usage: { in: 10, out: 5 } },
    ]);
    provider.enqueue([
      { type: "tool_call", id: "call_2", name: "read", args: { path: "server.js" } },
      { type: "done", usage: { in: 12, out: 4 } },
    ]);
    provider.enqueue([
      { type: "token", text: '{"status": "pass", "evidence": "finished 2 turns"}' },
      { type: "done", usage: { in: 8, out: 3 } },
    ]);
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false, maxIterations: 8, maxRetries: 0 });
    const task: BenchTask = { id: "e2e-multi", fixture: "tiny-express", description: "Multi-turn probe", expected: {} };
    const result = await runner.runOne(task);

    expect(result.taskId).toBe("e2e-multi");
    expect(result.fixture).toBe("tiny-express");
    expect(result.fixtureCopyPath).toContain("tiny-express");
    expect(result.fixtureCopyPath.length).toBeGreaterThan(20);
    expect(existsSync(result.fixtureCopyPath)).toBe(true);
    expect(result.testCommand).toContain("node test.js");
    expect(result.testExitCode).toBeDefined();
    expect(result.tokensIn).toBe(30);
    expect(result.tokensOut).toBe(12);
    expect(provider.captured.length).toBeGreaterThanOrEqual(1);
    const toolMessages = provider.captured[provider.captured.length - 1].messages.filter(m => m.role === "user");
    const hasToolResult = toolMessages.some(m =>
      Array.isArray(m.content) && m.content.some((b: { type: string }) => b.type === "tool_result")
    );
    expect(hasToolResult).toBe(true);
  });

  it("applies LLM tool_calls to the fixture copy so the test command runs against the modified copy", async () => {
    const provider = new FakeProvider();
    const marker = "/* INSERTED_BY_TOOL_CALL */\n";
    provider.enqueue([
      { type: "tool_call", id: "wc_1", name: "write", args: { path: "server.js", content: marker + "console.log('tool wrote me');\n" } },
      { type: "done", usage: { in: 5, out: 5 } },
    ]);
    provider.enqueue([
      { type: "token", text: '{"status": "pass", "evidence": "wrote file"}' },
      { type: "done", usage: { in: 1, out: 1 } },
    ]);
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false, maxIterations: 4 });
    const task: BenchTask = { id: "tool-write", fixture: "tiny-express", description: "write to fixture", expected: {} };
    const result = await runner.runOne(task);

    expect(existsSync(join(result.fixtureCopyPath, "server.js"))).toBe(true);
    const written = await readFile(join(result.fixtureCopyPath, "server.js"), "utf8");
    expect(written).toContain("INSERTED_BY_TOOL_CALL");
    expect(result.testCommand).toContain("node test.js");
    expect(result.testExitCode).toBeGreaterThanOrEqual(0);
  });

  it("reports blocked when the LLM emits a malformed final JSON", async () => {
    const provider = new FakeProvider();
    provider.enqueueMalformedJson();
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false, maxIterations: 4 });
    const task: BenchTask = { id: "bad-json", fixture: "tiny-express", description: "Probe", expected: {} };
    const result = await runner.runOne(task);

    expect(result.completed).toBe(false);
    expect(result.error).toMatch(/blocked|JSON/i);
  });

  it("records the disallowed tool as an error and never executes it", async () => {
    const provider = new FakeProvider();
    const workdirForLLM = await mkdtemp(join(tmpdir(), "llm-bench-llmloop-"));
    try {
      const sentinel = "DISALLOWED_SENTINEL_SENTINEL";
      provider.enqueue([
        { type: "tool_call", id: "bad_1", name: "definitely-not-a-real-tool", args: { cmd: `echo ${sentinel}` } },
        { type: "done", usage: { in: 0, out: 0 } },
      ]);
      provider.enqueue([
        { type: "token", text: `{"status": "pass", "evidence": "saw the tool error for ${sentinel}"}` },
        { type: "done", usage: { in: 0, out: 0 } },
      ]);
      const restrictedTools = [
        createBashTool({ cwd: workdirForLLM }),
        createReadTool({ cwd: workdirForLLM }),
        createWriteTool({ cwd: workdirForLLM }),
        createEditTool({ cwd: workdirForLLM }),
        createGrepTool({ cwd: workdirForLLM }),
        createGlobTool({ cwd: workdirForLLM }),
      ];
      const worker = new LlmWorker(provider, restrictedTools, workdirForLLM, { maxIterations: 4 });
      const ctx: StepContext = {
        taskId: "tsk_deadbeef",
        stepId: "disallowed",
        description: "Probe: tool not in allowed set",
        worktreePath: workdirForLLM,
      };
      const result = await worker.run("build", ctx);

      expect(result.status).toBe("pass");
      expect(result.evidence).toContain(sentinel);

      const lastUserMessage = provider.captured[1].messages
        .filter(m => m.role === "user")
        .pop();
      expect(lastUserMessage).toBeDefined();
      const toolResultBlock = Array.isArray(lastUserMessage!.content)
        ? lastUserMessage!.content.find((b: { type: string }) => b.type === "tool_result")
        : null;
      expect(toolResultBlock).toBeDefined();
      if (toolResultBlock) {
        expect((toolResultBlock as { is_error?: boolean }).is_error).toBe(true);
        expect(JSON.stringify(toolResultBlock)).toMatch(/not allowed/);
      }

      const bashRc = (() => {
        try {
          const out = execSync(`grep -R "${sentinel}" ${workdirForLLM} || true`, { encoding: "utf8" });
          return out.trim().length;
        } catch {
          return -1;
        }
      })();
      expect(bashRc).toBe(0);
    } finally {
      await rm(workdirForLLM, { recursive: true, force: true });
    }
  });

  it("does not leak files outside the workdir (no stray checkout, no fixture pollution)", async () => {
    const provider = new FakeProvider();
    provider.enqueue([
      { type: "tool_call", id: "wc_1", name: "write", args: { path: "README.md", content: "# updated\n" } },
      { type: "done", usage: { in: 0, out: 0 } },
    ]);
    provider.enqueue([
      { type: "token", text: '{"status": "pass", "evidence": "updated readme"}' },
      { type: "done", usage: { in: 0, out: 0 } },
    ]);
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false, maxIterations: 4 });
    const task: BenchTask = { id: "isolation", fixture: "tiny-express", description: "isolation probe", expected: {} };
    const before = await listWorkdir(workdir);
    const result = await runner.runOne(task);
    const after = await listWorkdir(workdir);

    expect(after.length).toBeGreaterThan(before.length);
    const newEntries = after.filter(p => !before.includes(p));
    const fixtureBasename = basename(result.fixtureCopyPath);
    for (const p of newEntries) {
      const firstSeg = p.split("/")[0] ?? "";
      expect(firstSeg).toBe(fixtureBasename);
    }
    const originalReadme = await readFile(join(process.cwd(), "bench/fixtures/tiny-express/README.md"), "utf8").catch(() => null);
    if (originalReadme !== null) {
      expect(originalReadme).not.toContain("# updated");
    }
  });

  it("runAllParallel runs 3 tasks concurrently and each gets a unique fixture copy", async () => {
    const provider = new FakeProvider();
    for (let i = 0; i < 3; i++) {
      provider.enqueue([
        { type: "token", text: '{"status": "pass", "evidence": "ok"}' },
        { type: "done", usage: { in: 7, out: 4 } },
      ]);
    }
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false, maxRetries: 0 });
    const summary = await runner.runAllParallel(
      (t) => t.id === "add-healthz" || t.id === "refactor-helper" || t.id === "fix-bug-auth",
    );
    expect(summary.total).toBe(3);
    expect(summary.results).toHaveLength(3);
    const paths = summary.results.map(r => r.fixtureCopyPath);
    expect(new Set(paths).size).toBe(3);
    for (const p of paths) {
      expect(existsSync(p)).toBe(true);
      const s = await stat(p);
      expect(s.isDirectory()).toBe(true);
    }
    expect(summary.tokensIn).toBeGreaterThan(0);
    expect(summary.tokensOut).toBeGreaterThan(0);
  });

  it("LlmBenchRunner.runAll calls the LLM once per task and produces a real per-task result", async () => {
    const provider = new FakeProvider();
    for (let i = 0; i < 3; i++) {
      provider.enqueue([
        { type: "token", text: `{"status": "pass", "evidence": "sc-${i}"}` },
        { type: "done", usage: { in: 2, out: 2 } },
      ]);
    }
    const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir, bootstrapDeps: false, maxRetries: 0 });
    const summary = await runner.runAllParallel(
      (t) => t.id === "add-healthz" || t.id === "refactor-helper" || t.id === "fix-bug-auth",
    );
    expect(summary.results).toHaveLength(3);
    expect(provider.captured.length).toBe(3);
    for (const r of summary.results) {
      expect(r.testCommand).toContain("node test.js");
      expect(r.fixtureCopyPath).toContain("tiny-express");
      expect(r.wallMs).toBeGreaterThan(0);
      expect(typeof r.completed).toBe("boolean");
      expect(r.tokensIn).toBeGreaterThan(0);
      expect(r.tokensOut).toBeGreaterThan(0);
    }
  });
});

async function listWorkdir(d: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  return readdir(d, { recursive: true });
}

function basename(p: string): string {
  return p.split("/").pop() ?? "";
}

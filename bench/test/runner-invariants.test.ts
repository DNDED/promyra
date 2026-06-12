import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LlmBenchRunner } from "../src/llm-bench-runner.js";
import { TASKS, BenchTask } from "../tasks/index.js";
import { Provider, Message, CallOpts, StreamChunk } from "@pi/provider";
import { testCommandFor, installHintFor } from "../src/llm-bench-runner.js";

class InvariantProvider implements Provider {
  name = "inv";
  capt: Message[][] = [];
  async *complete(msgs: Message[], opts: CallOpts) {
    this.capt.push(msgs);
    yield { type: "token", text: '{"status":"pass","evidence":"ok"}' };
    yield { type: "done", usage: { in: 1, out: 1 } };
  }
}

let workdir: string;
beforeEach(async () => { workdir = await mkdtemp(join(tmpdir(), "inv-")); });
afterEach(async () => { await rm(workdir, { recursive: true, force: true }); });

describe("bench runner invariants", () => {
  it("runOne always returns taskId, fixture, and wallMs > 0", async () => {
    const p = new InvariantProvider();
    const runner = new LlmBenchRunner(p, { workspaceRoot: workdir, bootstrapDeps: false, maxRetries: 0 });
    const task: BenchTask = { id: "r1", fixture: "tiny-express", description: "x", expected: {} };
    const result = await runner.runOne(task);
    expect(result.taskId).toBeTruthy();
    expect(result.fixture).toBeTruthy();
    expect(result.wallMs).toBeGreaterThan(0);
    expect(typeof result.completed).toBe("boolean");
  });

  it("runAll produces summary.total equal to TASKS.length", async () => {
    const p = new InvariantProvider();
    const runner = new LlmBenchRunner(p, { workspaceRoot: workdir, bootstrapDeps: false, maxRetries: 0 });
    const summary = await runner.runAll();
    expect(summary.total).toBe(TASKS.length);
  });

  it("runAll summary: completed + failed + skipped equals total", async () => {
    const p = new InvariantProvider();
    const runner = new LlmBenchRunner(p, { workspaceRoot: workdir, bootstrapDeps: false, maxRetries: 0 });
    const summary = await runner.runAll();
    expect(summary.completed + summary.failed + summary.skipped).toBe(summary.total);
  });

  it("testCommandFor returns a string for every known fixture", () => {
    const fixtures = new Set(TASKS.map(t => t.fixture));
    for (const f of fixtures) {
      expect(typeof testCommandFor(f)).toBe("string");
      expect(testCommandFor(f).length).toBeGreaterThan(0);
    }
  });

  it("installHintFor returns a non-empty string for every known fixture", () => {
    const fixtures = new Set(TASKS.map(t => t.fixture));
    for (const f of fixtures) {
      expect(typeof installHintFor(f)).toBe("string");
      expect(installHintFor(f).length).toBeGreaterThan(0);
    }
  });

  it("TASKS includes all 8 expected task IDs", () => {
    const ids = TASKS.map(t => t.id);
    expect(ids).toContain("refactor-helper");
    expect(ids).toContain("add-healthz");
    expect(ids).toContain("fix-bug-auth");
    expect(ids).toContain("add-tests-legacy");
    expect(ids).toContain("security-audit");
    expect(ids).toContain("refactor-async");
    expect(ids).toContain("add-error-middleware");
    expect(ids).toContain("add-input-sanitize");
  });
});

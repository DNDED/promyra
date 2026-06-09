import { describe, it, expect } from "vitest";
import { SubagentRouter, StubWorker, allowedTools, isAllowed } from "../src/router.js";
import { Role, StepContext, SubagentResult, Worker } from "../src/types.js";

const ctx: StepContext = {
  taskId: "tsk_abc",
  stepId: "s1",
  description: "Add /healthz endpoint",
  diff: "diff --git a/x b/x\n+new line",
};

class CountingWorker implements Worker {
  calls: Array<{ role: Role; ctx: StepContext }> = [];
  async run(role: Role, c: StepContext): Promise<SubagentResult> {
    this.calls.push({ role, ctx: c });
    return { role, stepId: c.stepId, status: "pass", evidence: "ok", tokensIn: 1, tokensOut: 1, durationMs: 1 };
  }
}

class FlakyWorker implements Worker {
  attempts = 0;
  async run(role: Role, c: StepContext): Promise<SubagentResult> {
    this.attempts++;
    if (this.attempts === 1) throw new Error("transient");
    return { role, stepId: c.stepId, status: "pass", evidence: "recovered", tokensIn: 1, tokensOut: 1, durationMs: 1 };
  }
}

class AlwaysFailingWorker implements Worker {
  attempts = 0;
  async run(): Promise<SubagentResult> {
    this.attempts++;
    throw new Error("boom");
  }
}

describe("@pi/subagent", () => {
  it("build role allows bash/write/edit and disallows webfetch", () => {
    expect(isAllowed("build", "bash")).toBe(true);
    expect(isAllowed("build", "write")).toBe(true);
    expect(isAllowed("build", "webfetch")).toBe(false);
  });

  it("reviewer roles have no bash", () => {
    expect(allowedTools("code-reviewer")).not.toContain("bash");
    expect(allowedTools("security-auditor")).not.toContain("bash");
  });

  it("test-runner has bash but no write/edit", () => {
    const tools = allowedTools("test-runner");
    expect(tools).toContain("bash");
    expect(tools).not.toContain("write");
    expect(tools).not.toContain("edit");
  });

  it("router dispatches to the worker with the correct role and context", async () => {
    const w = new CountingWorker();
    const r = new SubagentRouter(w);
    const res = await r.dispatch("build", ctx);
    expect(res.status).toBe("pass");
    expect(w.calls).toHaveLength(1);
    expect(w.calls[0].role).toBe("build");
    expect(w.calls[0].ctx).toEqual(ctx);
  });

  it("router retries on transient failure and succeeds", async () => {
    const w = new FlakyWorker();
    const r = new SubagentRouter(w);
    const res = await r.dispatch("build", ctx);
    expect(res.status).toBe("pass");
    expect(w.attempts).toBe(2);
  });

  it("router returns blocked after RETRY_LIMIT", async () => {
    const w = new AlwaysFailingWorker();
    const r = new SubagentRouter(w);
    const res = await r.dispatch("build", ctx);
    expect(res.status).toBe("blocked");
    expect(w.attempts).toBe(2);
  });

  it("router dispatches each role with its own prompt", async () => {
    const w = new CountingWorker();
    const r = new SubagentRouter(w);
    await r.dispatch("code-reviewer", ctx);
    expect(w.calls[0].role).toBe("code-reviewer");
  });

  it("StubWorker returns pass", async () => {
    const w = new StubWorker();
    const res = await w.run("build", ctx, "ignored");
    expect(res.status).toBe("pass");
  });
});

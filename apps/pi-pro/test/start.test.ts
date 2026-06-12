import { describe, it, expect } from "vitest";
import {
  buildPlan,
  formatCompletionMessage,
  prettifyArgs,
  shouldRetry,
  retryFeedback,
} from "../src/commands/start.js";

describe("pi buildPlan", () => {
  it("has 4 steps when in a git repo", () => {
    const plan = buildPlan("tsk_abc", "fix bug", true);
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps[0].id).toBe("intake");
    expect(plan.steps[3].id).toBe("done");
  });

  it("has 3 steps when not in a git repo", () => {
    const plan = buildPlan("tsk_abc", "fix bug", false);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[2].id).toBe("done");
  });

  it("preserves taskId and title", () => {
    const plan = buildPlan("tsk_xyz", "add healthz", true);
    expect(plan.taskId).toBe("tsk_xyz");
    expect(plan.title).toBe("add healthz");
  });
});

describe("pi formatCompletionMessage", () => {
  it("includes the taskId", () => {
    const msg = formatCompletionMessage("tsk_abc");
    expect(msg).toContain("tsk_abc");
  });

  it("uses pi merge command", () => {
    const msg = formatCompletionMessage("tsk_abc");
    expect(msg).toContain("pi merge");
  });

  it("has checkmark prefix", () => {
    const msg = formatCompletionMessage("tsk_x");
    expect(msg.startsWith("✓")).toBe(true);
  });
});

describe("pi prettifyArgs", () => {
  it("formats read with path", () => {
    expect(prettifyArgs("read", { path: "/src/foo.ts" })).toBe("/src/foo.ts");
  });

  it("formats read with offset + limit", () => {
    expect(prettifyArgs("read", { path: "/x.ts", offset: 10, limit: 20 })).toBe("/x.ts:10-30");
  });

  it("formats read with limit only", () => {
    expect(prettifyArgs("read", { path: "/x.ts", limit: 50 })).toBe("/x.ts (first 50 lines)");
  });

  it("formats write with byte count", () => {
    expect(prettifyArgs("write", { path: "/x.ts", content: "hello world" })).toBe("/x.ts (11 bytes)");
  });

  it("formats edit with path", () => {
    expect(prettifyArgs("edit", { path: "/x.ts" })).toBe("/x.ts");
  });

  it("formats bash with truncated command", () => {
    const long = "x".repeat(100);
    const result = prettifyArgs("bash", { command: long });
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith("...")).toBe(true);
  });

  it("formats bash with short command unchanged", () => {
    expect(prettifyArgs("bash", { command: "ls -la" })).toBe("ls -la");
  });

  it("formats grep with pattern + path", () => {
    expect(prettifyArgs("grep", { pattern: "TODO", path: "/src" })).toBe('"TODO" in /src');
  });

  it("formats grep with default path", () => {
    expect(prettifyArgs("grep", { pattern: "TODO" })).toBe('"TODO" in .');
  });

  it("formats glob with pattern", () => {
    expect(prettifyArgs("glob", { pattern: "**/*.ts" })).toBe("**/*.ts");
  });

  it("formats webfetch with url", () => {
    expect(prettifyArgs("webfetch", { url: "https://x.com" })).toBe("https://x.com");
  });

  it("formats task with description", () => {
    expect(prettifyArgs("task", { description: "audit the code" })).toBe("audit the code");
  });

  it("returns empty string for no args", () => {
    expect(prettifyArgs("read", undefined)).toBe("");
  });

  it("falls back to first string arg for unknown tool", () => {
    expect(prettifyArgs("foobar", { thing: "value" })).toBe("value");
  });
});

describe("pi shouldRetry", () => {
  it("retries on fail", () => {
    expect(shouldRetry({ role: "build", stepId: "x", status: "fail", evidence: "x", tokensIn: 0, tokensOut: 0, durationMs: 0 })).toBe(true);
  });

  it("retries on blocked", () => {
    expect(shouldRetry({ role: "build", stepId: "x", status: "blocked", evidence: "x", tokensIn: 0, tokensOut: 0, durationMs: 0 })).toBe(true);
  });

  it("does not retry on pass", () => {
    expect(shouldRetry({ role: "build", stepId: "x", status: "pass", evidence: "x", tokensIn: 0, tokensOut: 0, durationMs: 0 })).toBe(false);
  });
});

describe("pi retryFeedback", () => {
  it("includes previous status", () => {
    const fb = retryFeedback(
      { role: "build", stepId: "x", status: "fail", evidence: "test failed: expected 200", tokensIn: 0, tokensOut: 0, durationMs: 0 },
      "fix auth"
    );
    expect(fb).toContain("Status: fail");
    expect(fb).toContain("test failed: expected 200");
  });

  it("includes original task", () => {
    const fb = retryFeedback(
      { role: "build", stepId: "x", status: "fail", evidence: "x", tokensIn: 0, tokensOut: 0, durationMs: 0 },
      "add a /healthz endpoint"
    );
    expect(fb).toContain("add a /healthz endpoint");
  });

  it("truncates long evidence", () => {
    const longEvidence = "x".repeat(2000);
    const fb = retryFeedback(
      { role: "build", stepId: "x", status: "fail", evidence: longEvidence, tokensIn: 0, tokensOut: 0, durationMs: 0 },
      "task"
    );
    expect(fb.length).toBeLessThan(longEvidence.length);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { CheckpointStore } from "@pi/checkpoint";
import { SessionMemory } from "@pi/memory";
import { SessionLog } from "../src/session-log.js";
import { WorktreeStore } from "../src/worktree-store.js";
import { TaskRunner, Plan } from "../src/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "tasks-integration-"));
  execSync("git init -q", { cwd: dir });
  execSync("git config user.email test@local", { cwd: dir });
  execSync("git config user.name test", { cwd: dir });
  execSync("git commit --allow-empty -q -m init", { cwd: dir });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeDeps() {
  const checkpoint = new CheckpointStore(dir);
  const memory = new SessionMemory(dir);
  const log = new SessionLog(dir);
  const worktree = new WorktreeStore(dir);
  return { checkpoint, memory, log, worktree };
}

describe("@pi/tasks — end-to-end TaskRunner integration", () => {
  it("runs a full task intake → plan → branch → execute → verify → summarize → done", async () => {
    const deps = makeDeps();
    const taskId = deps.checkpoint.newTaskId();
    const plan: Plan = {
      taskId,
      title: "Add a /healthz endpoint",
      steps: [
        { id: "s1", description: "Read existing server.js", done: false },
        { id: "s2", description: "Add /healthz route", done: false },
        { id: "s3", description: "Verify with smoke test", done: false },
      ],
    };
    const runner = new TaskRunner(taskId, plan, deps);

    expect(runner.state()).toBe("intake");
    await runner.intake();
    expect(runner.state()).toBe("plan");

    const wt = await runner.branch();
    expect(runner.state()).toBe("execute");
    expect(wt.branch).toMatch(/^pi-pro\/[a-f0-9]{10}$/);
    expect(existsSync(wt.path)).toBe(true);

    await runner.markStepDone("s1");
    await runner.markStepDone("s2");
    await runner.markStepDone("s3");

    await runner.verifyPassed();
    expect(runner.state()).toBe("summarize");
    await runner.summarize("Added /healthz returning 200, all 3 steps complete.");
    await runner.transition("done");
    expect(runner.state()).toBe("done");

    const checkpoints = await deps.checkpoint.listForTask(taskId);
    expect(checkpoints.length).toBeGreaterThanOrEqual(5);
    const states = checkpoints.map(c => c.state);
    expect(states).toContain("plan");
    expect(states).toContain("branch");
    expect(states).toContain("execute");
    expect(states).toContain("verify");
    expect(states).toContain("summarize");
    expect(states).toContain("done");

    const latest = await deps.checkpoint.latest(taskId);
    expect(latest).not.toBeNull();
    expect(latest?.state).toBe("done");

    const events = await deps.log.read(taskId);
    expect(events.length).toBeGreaterThan(0);
    const eventTypes = new Set(events.map(e => e.event));
    expect(eventTypes.has("transition")).toBe(true);
    expect(eventTypes.has("step-done")).toBe(true);
    expect(eventTypes.has("checkpoint")).toBe(true);

    const memoryRaw = await deps.memory.read();
    expect(memoryRaw).toContain("Triage");
    expect(memoryRaw).toContain("Add a /healthz endpoint");
    expect(memoryRaw).toContain("Task " + taskId);
    expect(memoryRaw).toContain("Added /healthz returning 200");

    const worktrees = deps.worktree.list();
    const ourWt = worktrees.find(w => w.taskId === taskId);
    expect(ourWt).toBeDefined();
    expect(ourWt?.path).toBe(wt.path);
  });

  it("rejects taskIds that are too short, contain uppercase, or contain shell metacharacters", () => {
    const wt = new WorktreeStore(dir);
    const invalidIds = [
      "tsk_abc",
      "tsk_ABCDEF01",
      "tsk_abcdef;rm",
      "tsk_abcd'$x",
      "tsk_aBcd1234",
      "not_a_real_id",
      "tsk_",
      "",
    ];
    for (const id of invalidIds) {
      expect(() => wt.create(id), `expected create("${id}") to throw`).toThrow(/Invalid taskId/);
    }
  });

  it("accepts a valid taskId and creates a real worktree on a real branch", () => {
    const wt = new WorktreeStore(dir);
    const info = wt.create("tsk_abcdef12");
    expect(info.branch).toBe("pi-pro/abcdef12");
    expect(info.path).toBe(join(dir, ".pi-pro/worktrees/tsk_abcdef12"));
    expect(existsSync(info.path)).toBe(true);
    const inRepo = execSync("git rev-parse --is-inside-work-tree", { cwd: info.path, encoding: "utf8" }).trim();
    expect(inRepo).toBe("true");
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: info.path, encoding: "utf8" }).trim();
    expect(branch).toBe("pi-pro/abcdef12");
  });

  it("resumes a task from the latest checkpoint and continues correctly", async () => {
    const deps = makeDeps();
    const taskId = deps.checkpoint.newTaskId();
    const plan: Plan = {
      taskId,
      title: "Refactor parseUserInput",
      steps: [
        { id: "a", description: "Identify duplication", done: false },
        { id: "b", description: "Extract helper", done: false },
      ],
    };

    const runner1 = new TaskRunner(taskId, plan, deps);
    await runner1.intake();
    await runner1.branch();
    await runner1.markStepDone("a");
    await runner1.verifyPassed();
    expect(runner1.state()).toBe("summarize");

    const latest = await deps.checkpoint.latest(taskId);
    expect(latest).not.toBeNull();
    expect(latest?.state).toBe("summarize");

    const resumedPlan: Plan = { ...plan, steps: plan.steps.map(s => ({ ...s, done: s.id === "a" })) };
    const runner2 = new TaskRunner(taskId, resumedPlan, deps, {}, latest!.state as never);
    expect(runner2.state()).toBe("summarize");
    expect(runner2.getTaskId()).toBe(taskId);
    expect(runner2.getPlan().steps.find(s => s.id === "a")?.done).toBe(true);
    expect(runner2.getPlan().steps.find(s => s.id === "b")?.done).toBe(false);

    const allCheckpoints = await deps.checkpoint.listForTask(taskId);
    expect(allCheckpoints.length).toBeGreaterThanOrEqual(4);
    const states = allCheckpoints.map(c => c.state);
    expect(states).toContain("plan");
    expect(states).toContain("branch");
    expect(states).toContain("execute");
    expect(states).toContain("verify");
    expect(states).toContain("summarize");
  });

  it("cleans up checkpoints and worktree without errors after a full task", async () => {
    const deps = makeDeps();
    const taskId = deps.checkpoint.newTaskId();
    const plan: Plan = { taskId, title: "Cleanup probe", steps: [{ id: "x", description: "do it", done: false }] };
    const runner = new TaskRunner(taskId, plan, deps);
    await runner.intake();
    const wt = await runner.branch();
    await runner.markStepDone("x");
    await runner.verifyPassed();
    await runner.summarize("done");
    await runner.transition("done");

    expect((await deps.checkpoint.listForTask(taskId)).length).toBeGreaterThan(0);
    expect(existsSync(wt.path)).toBe(true);

    await deps.checkpoint.clearTask(taskId);
    expect((await deps.checkpoint.listForTask(taskId)).length).toBe(0);
    expect(existsSync(join(dir, ".pi-pro/checkpoints", taskId))).toBe(false);

    deps.worktree.remove(taskId);
    expect(existsSync(wt.path)).toBe(false);
    const remaining = deps.worktree.list().filter(w => w.taskId === taskId);
    expect(remaining).toHaveLength(0);
  });

  it("persists the session log to disk and the events are valid JSONL with monotonic timestamps", async () => {
    const deps = makeDeps();
    const taskId = deps.checkpoint.newTaskId();
    const plan: Plan = { taskId, title: "log probe", steps: [] };
    const runner = new TaskRunner(taskId, plan, deps);
    await runner.intake();
    await runner.branch();
    await runner.verifyPassed();
    await runner.summarize("log probe done");
    await runner.transition("done");

    const logPath = join(dir, ".pi-pro/sessions", `${taskId}.jsonl`);
    const s = await stat(logPath);
    expect(s.isFile()).toBe(true);
    expect(s.size).toBeGreaterThan(0);

    const raw = await readFile(logPath, "utf8");
    const lines = raw.trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    const events = lines.map(l => JSON.parse(l));
    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].ts).getTime();
      const cur = new Date(events[i].ts).getTime();
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });
});

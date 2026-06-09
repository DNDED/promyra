import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/store.js";

let dir: string;
let store: CheckpointStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "checkpoint-test-"));
  store = new CheckpointStore(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("@pi/checkpoint", () => {
  it("creates checkpoints with predictable ids", async () => {
    const taskId = store.newTaskId();
    const cp1 = await store.snapshot({ seq: 1, taskId, state: "intake", gitTreeSha: "abc1234", payload: { foo: 1 } });
    const cp2 = await store.snapshot({ seq: 2, taskId, state: "plan", gitTreeSha: "abc1234", payload: { plan: "x" } });
    expect(cp1.id).toBe("chk_000001");
    expect(cp2.id).toBe("chk_000002");
    expect(cp1.state).toBe("intake");
  });

  it("lists checkpoints in order", async () => {
    const taskId = store.newTaskId();
    await store.snapshot({ seq: 1, taskId, state: "intake", gitTreeSha: "abc1234", payload: {} });
    await store.snapshot({ seq: 2, taskId, state: "plan", gitTreeSha: "abc1234", payload: {} });
    await store.snapshot({ seq: 3, taskId, state: "branch", gitTreeSha: "abc1234", payload: {} });
    const all = await store.listForTask(taskId);
    expect(all.map(c => c.state)).toEqual(["intake", "plan", "branch"]);
  });

  it("retrieves the latest checkpoint", async () => {
    const taskId = store.newTaskId();
    await store.snapshot({ seq: 1, taskId, state: "intake", gitTreeSha: "abc1234", payload: { a: 1 } });
    const latest = await store.snapshot({ seq: 2, taskId, state: "plan", gitTreeSha: "def5678", payload: { b: 2 } });
    const got = await store.latest(taskId);
    expect(got?.id).toBe(latest.id);
  });

  it("writes session log lines", async () => {
    const taskId = store.newTaskId();
    await store.snapshot({ seq: 1, taskId, state: "intake", gitTreeSha: "abc1234", payload: {} });
    const log = await readFile(join(dir, ".pi-pro/sessions", `${taskId}.jsonl`), "utf8");
    expect(log).toContain("\"state\":\"intake\"");
    expect(log).toContain("\"event\":\"checkpoint\"");
  });

  it("hashes payloads deterministically", () => {
    const a = store.hashPayload({ a: 1, b: 2 });
    const b = store.hashPayload({ a: 1, b: 2 });
    const c = store.hashPayload({ a: 1, b: 3 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("clears a task", async () => {
    const taskId = store.newTaskId();
    await store.snapshot({ seq: 1, taskId, state: "intake", gitTreeSha: "abc1234", payload: {} });
    await store.clearTask(taskId);
    expect(await store.latest(taskId)).toBeNull();
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { generatePrBody, buildPrTitle, findWorktreeForTask } from "../src/commands/merge.js";

let repo: string;
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "merge-test-"));
  execSync("git init -q", { cwd: repo });
  execSync("git config user.email t@local", { cwd: repo });
  execSync("git config user.name t", { cwd: repo });
  execSync("git commit --allow-empty -q -m init", { cwd: repo });
  execSync("git branch -m master", { cwd: repo });
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("buildPrTitle", () => {
  it("prefixes with pi-pro:", () => {
    expect(buildPrTitle("Add /healthz endpoint")).toBe("pi-pro: Add /healthz endpoint");
  });

  it("truncates very long titles", () => {
    const long = "a".repeat(200);
    const title = buildPrTitle(long);
    expect(title.length).toBeLessThanOrEqual(80);
  });
});

describe("generatePrBody", () => {
  it("includes the task description", () => {
    const body = generatePrBody({
      taskId: "tsk_abc",
      title: "Add /healthz endpoint",
      branch: "pi-pro/abc",
      changes: ["src/server.ts", "src/server.test.ts"],
      verification: "47/47 tests passing",
    });
    expect(body).toContain("Add /healthz endpoint");
    expect(body).toContain("tsk_abc");
    expect(body).toContain("src/server.ts");
    expect(body).toContain("47/47 tests passing");
  });

  it("includes a checklist of changes", () => {
    const body = generatePrBody({
      taskId: "tsk_x",
      title: "x",
      branch: "pi-pro/x",
      changes: ["a.ts", "b.ts", "c.ts"],
    });
    expect(body).toMatch(/- \[ \] a\.ts/);
    expect(body).toMatch(/- \[ \] b\.ts/);
    expect(body).toMatch(/- \[ \] c\.ts/);
  });

  it("uses markdown formatting suitable for gh pr create --body", () => {
    const body = generatePrBody({
      taskId: "tsk_x",
      title: "x",
      branch: "pi-pro/x",
      changes: [],
    });
    expect(body).toContain("##");
    expect(body.length).toBeGreaterThan(50);
  });
});

describe("findWorktreeForTask", () => {
  it("finds the worktree for a given task id", async () => {
    const wt = join(repo, ".pi-pro", "worktrees", "tsk_abc");
    execSync(`mkdir -p '${wt}'`);
    execSync(`git worktree add -b pi-pro/abc '${wt}'`, { cwd: repo });
    const found = findWorktreeForTask("tsk_abc", repo);
    expect(found).not.toBeNull();
    expect(found!.branch).toBe("pi-pro/abc");
    expect(found!.path).toBe(wt);
  });

  it("returns null when no worktree matches", () => {
    const found = findWorktreeForTask("tsk_nope", repo);
    expect(found).toBeNull();
  });
});

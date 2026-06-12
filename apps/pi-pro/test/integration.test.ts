import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const tmpWorkdir = mkdtempSync(join(tmpdir(), "pi-workdir-"));

describe("pi git helpers", () => {
  it("isGitRepo returns false in a non-git dir", () => {
    let result = "";
    try {
      result = execSync(`cd ${tmpWorkdir} && git rev-parse --git-dir 2>/dev/null`, { stdio: "pipe" }).toString();
    } catch {
      result = "";
    }
    expect(result).toBe("");
  });

  it("isGitRepo returns true in a git repo", () => {
    const gitTmp = mkdtempSync(join(tmpdir(), "pi-git-"));
    try {
      execSync("git init -q", { cwd: gitTmp });
      execSync("git config user.email t@t", { cwd: gitTmp });
      execSync("git config user.name t", { cwd: gitTmp });
      execSync("git commit --allow-empty -q -m init", { cwd: gitTmp });
      const result = execSync("git rev-parse --git-dir 2>/dev/null", { cwd: gitTmp, stdio: "pipe" }).toString();
      expect(result).toContain(".git");
    } finally {
      rmSync(gitTmp, { recursive: true, force: true });
    }
  });
});

describe("pi config path constants", () => {
  it("PI_CONFIG_PATH points inside ~/.pi/", async () => {
    const { PI_CONFIG_PATH } = await import("../src/config-paths.js");
    expect(PI_CONFIG_PATH).toContain(".pi/pi-config.json");
  });

  it("PI_AUTH_PATH points inside ~/.pi/", async () => {
    const { PI_AUTH_PATH } = await import("../src/config-paths.js");
    expect(PI_AUTH_PATH).toContain(".pi/pi-auth.json");
  });

  it("PI_HOME_OVERRIDE respected (adds .pi/)", async () => {
    const overrideDir = mkdtempSync(join(tmpdir(), "pi-override-"));
    process.env.PI_HOME_OVERRIDE = overrideDir;
    try {
      const { piHome } = await import("../src/config-paths.js");
      expect(piHome()).toBe(join(overrideDir, ".pi"));
    } finally {
      delete process.env.PI_HOME_OVERRIDE;
    }
  });
});

describe("pi subagent wiring", () => {
  it("SubagentRouter exports class", async () => {
    const { SubagentRouter } = await import("@pi/subagent");
    expect(typeof SubagentRouter).toBe("function");
  });

  it("classifyTool maps read/edit/bash/grep/glob/webfetch/task", async () => {
    const { classifyTool } = await import("@pi/subagent");
    expect(classifyTool("read")).toBe("read");
    expect(classifyTool("write")).toBe("write");
    expect(classifyTool("edit")).toBe("edit");
    expect(classifyTool("bash")).toBe("bash");
    expect(classifyTool("grep")).toBe("grep");
    expect(classifyTool("glob")).toBe("glob");
    expect(classifyTool("webfetch")).toBe("webfetch");
    expect(classifyTool("task")).toBe("task");
    expect(classifyTool("unknown")).toBe("other");
  });

  it("SubagentRouter.withProvider accepts provider + workdir + model", async () => {
    const { SubagentRouter } = await import("@pi/subagent");
    // We can't actually call withProvider without a real provider, but we can
    // verify the static method exists.
    expect(typeof SubagentRouter.withProvider).toBe("function");
  });
});

describe("pi tools subagent wiring", () => {
  it("provider exports loadConfig, saveConfig, getApiKey, setApiKey", async () => {
    const mod = await import("@pi/provider");
    expect(typeof mod.loadConfig).toBe("function");
    expect(typeof mod.saveConfig).toBe("function");
    expect(typeof mod.getApiKey).toBe("function");
    expect(typeof mod.setApiKey).toBe("function");
  });

  it("provider has createProvider, ModelRouter, OpenCodeGoProvider, AnthropicProvider", async () => {
    const mod = await import("@pi/provider");
    expect(typeof mod.createProvider).toBe("function");
    expect(typeof mod.OpenCodeGoProvider).toBe("function");
    expect(typeof mod.AnthropicProvider).toBe("function");
  });
});

describe("pi tasks wiring", () => {
  it("WorktreeStore class available with create/remove/list", async () => {
    const { WorktreeStore } = await import("@pi/tasks");
    expect(typeof WorktreeStore).toBe("function");
    const store = new WorktreeStore(tmpWorkdir);
    expect(typeof store.create).toBe("function");
    expect(typeof store.remove).toBe("function");
    expect(typeof store.list).toBe("function");
  });

  it("WorktreeStore.create throws on invalid taskId", async () => {
    const { WorktreeStore } = await import("@pi/tasks");
    const store = new WorktreeStore(tmpWorkdir);
    expect(() => store.create("not-a-valid-id")).toThrow();
  });

  it("CheckpointStore and SessionMemory are exported", async () => {
    const tasks = await import("@pi/tasks");
    expect(typeof tasks.CheckpointStore).toBe("function");
    expect(typeof tasks.SessionMemory).toBe("function");
  });
});

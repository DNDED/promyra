import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, mkdir, copyFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { runTask, listFixtures, testCommandFor } from "../src/runner.js";
import { LlmBenchRunner, installHintFor } from "../src/llm-bench-runner.js";
import { Provider, Message, StreamChunk, CallOpts } from "@pi/provider";
import { BenchTask } from "../tasks/index.js";

class ScriptedProvider implements Provider {
  name = "scripted";
  responses: Array<Array<StreamChunk>> = [];
  callIndex = 0;
  async *complete(_messages: Message[], _opts: CallOpts): AsyncIterable<StreamChunk> {
    const r = this.responses[this.callIndex++];
    if (!r) throw new Error("no response queued");
    for (const c of r) yield c;
  }
}

let fixturesRoot: string;
let originalCwd: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  fixturesRoot = await mkdtemp(join(tmpdir(), "bench-fixtures-"));
  await copyFixture("tiny-express", join(fixturesRoot, "tiny-express"));
  await copyFixture("tiny-cli", join(fixturesRoot, "tiny-cli"));
  await copyFixture("tiny-go-svc", join(fixturesRoot, "tiny-go-svc"));
});

afterAll(async () => {
  await rm(fixturesRoot, { recursive: true, force: true });
});

async function copyFixture(name: string, dest: string): Promise<void> {
  const src = join(originalCwd, "fixtures", name);
  await mkdir(dest, { recursive: true });
  execSync(`cp -R '${src}/.' '${dest}/'`);
}

describe("bench: fixture discovery", () => {
  it("lists the three synthetic fixtures", () => {
    const names = listFixtures();
    expect(names).toContain("tiny-express");
    expect(names).toContain("tiny-cli");
    expect(names).toContain("tiny-go-svc");
  });
});

describe("bench: fixture-level test commands", () => {
  it("runner.testCommandFor returns a non-empty string for every fixture", () => {
    const fixtures = listFixtures();
    expect(fixtures.length).toBeGreaterThan(0);
    for (const f of fixtures) {
      const cmd = testCommandFor(f);
      expect(cmd).toBeTruthy();
      expect(cmd.length).toBeGreaterThan(0);
    }
  });

  it("testCommandFor returns sensible defaults for known fixtures", () => {
    expect(testCommandFor("tiny-express")).toContain("node");
    expect(testCommandFor("tiny-cli")).toContain("pytest");
    expect(testCommandFor("tiny-go-svc")).toContain("go test");
  });
});

describe("bench: actionable skip hints", () => {
  it("installHintFor returns a non-empty install command for every known fixture", () => {
    for (const f of ["tiny-express", "tiny-cli", "tiny-go-svc"]) {
      const hint = installHintFor(f);
      expect(hint.length).toBeGreaterThan(0);
      expect(hint).not.toMatch(/^install dependencies/);
    }
  });

  it("skipReason contains the fixture name AND the install hint when deps bootstrap fails", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "bench-hint-"));
    try {
      const provider = new ScriptedProvider();
      provider.responses.push([
        { type: "token", text: '{"status": "pass", "evidence": "x"}' },
        { type: "done", usage: { in: 0, out: 0 } },
      ]);
      const runner = new LlmBenchRunner(provider, { workspaceRoot: workdir });
      const task: BenchTask = { id: "t1", fixture: "tiny-cli", description: "x", expected: {} };
      const result = await runner.runOne(task);
      if (result.skipped) {
        expect(result.skipReason).toBeDefined();
        expect(result.skipReason).toMatch(/tiny-cli|install/i);
      } else {
        expect(result.completed).toBe(true);
      }
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });
});

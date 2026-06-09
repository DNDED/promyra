import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, mkdir, copyFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { runTask, listFixtures, testCommandFor } from "../src/runner.js";

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

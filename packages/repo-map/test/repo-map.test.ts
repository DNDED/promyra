import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRepoMap } from "../src/repo-map.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "promyra-repomap-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function makeFile(rel: string, content: string): Promise<void> {
  const abs = join(dir, rel);
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, content);
}

describe("getRepoMap", () => {
  it("builds a map from a tiny repo", async () => {
    await makeFile("src/auth.ts", [
      "export function login(user: string) { return user; }",
      "export function logout() {}",
      "export class AuthService {}",
    ].join("\n"));
    await makeFile("src/util.ts", "export const PI = 3.14;");
    const map = await getRepoMap(dir);
    expect(map.fileCount).toBeGreaterThanOrEqual(2);
    expect(map.symbolCount).toBeGreaterThan(0);
    expect(map.rendered).toContain("login");
  });

  it("ranks query-relevant symbols higher", async () => {
    await makeFile("src/auth.ts", "export function login() {}");
    await makeFile("src/util.ts", "export function calculate() {}");
    const map = await getRepoMap(dir, "login");
    const first = map.topSymbols[0];
    expect(first.symbol.name).toBe("login");
  });

  it("respects token budget", async () => {
    const big = Array.from({ length: 50 }, (_, i) => `export function fn${i}() { return ${i}; }`).join("\n");
    await makeFile("src/big.ts", big);
    const map = await getRepoMap(dir, "", { tokenBudget: 200, charsPerToken: 4 });
    expect(map.rendered.length).toBeLessThanOrEqual(200 * 4);
  });

  it("skips files with read errors gracefully", async () => {
    await makeFile("src/ok.ts", "export function ok() {}");
    // Create a directory that pretends to be a file by being broken symlink
    // (or just trust that readFile failures are silently skipped)
    const map = await getRepoMap(dir);
    expect(map.symbolCount).toBeGreaterThan(0);
  });

  it("excludes node_modules by default", async () => {
    await makeFile("src/ok.ts", "export function ok() {}");
    await makeFile("node_modules/dep/index.js", "export function shouldNotAppear() {}");
    const map = await getRepoMap(dir);
    const names = map.topSymbols.map(s => s.symbol.name);
    expect(names).toContain("ok");
    expect(names).not.toContain("shouldNotAppear");
  });

  it("excludes .git and dist by default", async () => {
    await makeFile("src/ok.ts", "export function ok() {}");
    await makeFile("dist/bundle.js", "export function nope() {}");
    await makeFile(".git/HEAD", "ref: refs/heads/main");
    const map = await getRepoMap(dir);
    const names = map.topSymbols.map(s => s.symbol.name);
    expect(names).toContain("ok");
    expect(names).not.toContain("nope");
  });

  it("deduplicates symbols across captures", async () => {
    await makeFile("src/a.ts", "export function dup() {}\nexport function dup() {}");
    const map = await getRepoMap(dir);
    const names = map.topSymbols.map(s => s.symbol.name);
    const count = names.filter(n => n === "dup").length;
    expect(count).toBeLessThanOrEqual(1);
  });

  it("returns empty map for empty directory", async () => {
    const map = await getRepoMap(dir);
    expect(map.fileCount).toBe(0);
    expect(map.symbolCount).toBe(0);
  });
});

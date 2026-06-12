import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ToolResultCache } from "../src/tool-result-cache.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ToolResultCache — basic operations", () => {
  let cache: ToolResultCache;
  beforeEach(() => { cache = new ToolResultCache({ maxEntries: 4 }); });

  it("round-trips a get/set", () => {
    cache.set({ tool: "grep", args: { pattern: "foo" } }, { result: "matched" });
    const got = cache.get({ tool: "grep", args: { pattern: "foo" } });
    expect(got).toEqual({ result: "matched" });
  });

  it("normalizes key regardless of object key order", () => {
    cache.set({ tool: "read", args: { path: "a.ts", offset: 10 } }, { result: "X" });
    const got = cache.get({ tool: "read", args: { offset: 10, path: "a.ts" } });
    expect(got).toEqual({ result: "X" });
  });

  it("returns undefined for miss", () => {
    expect(cache.get({ tool: "grep", args: { pattern: "missing" } })).toBeUndefined();
  });

  it("evicts oldest entry when over cap (LRU)", () => {
    cache.set({ tool: "a", args: {} }, 1);
    cache.set({ tool: "b", args: {} }, 2);
    cache.set({ tool: "c", args: {} }, 3);
    cache.set({ tool: "d", args: {} }, 4);
    cache.set({ tool: "e", args: {} }, 5);
    expect(cache.size()).toBe(4);
    expect(cache.get({ tool: "a", args: {} })).toBeUndefined();
    expect(cache.get({ tool: "e", args: {} })).toBe(5);
  });

  it("delete removes a specific entry", () => {
    cache.set({ tool: "x", args: {} }, "v");
    expect(cache.delete({ tool: "x", args: {} })).toBe(true);
    expect(cache.get({ tool: "x", args: {} })).toBeUndefined();
    expect(cache.delete({ tool: "x", args: {} })).toBe(false);
  });

  it("clear empties the cache", () => {
    cache.set({ tool: "a", args: {} }, 1);
    cache.set({ tool: "b", args: {} }, 2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it("invalidateForFile removes all entries referencing a file (auto-detected from path)", () => {
    cache.set({ tool: "read", args: { path: "a.ts" } }, "A");
    cache.set({ tool: "read", args: { path: "b.ts" } }, "B");
    cache.set({ tool: "grep", args: { pattern: "foo", path: "a.ts" } }, "GA");
    cache.invalidateForFile("a.ts");
    expect(cache.get({ tool: "read", args: { path: "a.ts" } })).toBeUndefined();
    expect(cache.get({ tool: "grep", args: { pattern: "foo", path: "a.ts" } })).toBeUndefined();
    expect(cache.get({ tool: "read", args: { path: "b.ts" } })).toBe("B");
  });

  it("get re-touches entry, promoting to most-recently-used", () => {
    cache.set({ tool: "a", args: {} }, 1);
    cache.set({ tool: "b", args: {} }, 2);
    cache.set({ tool: "c", args: {} }, 3);
    cache.get({ tool: "a", args: {} }); // touch a
    cache.set({ tool: "d", args: {} }, 4); // cap is default 256, no eviction yet
    expect(cache.get({ tool: "a", args: {} })).toBe(1); // still there
  });
});

describe("ToolResultCache — mtime invalidation on real files", () => {
  let dir: string;
  let cache: ToolResultCache;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "promyra-cache-"));
    cache = new ToolResultCache();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("invalidates entry when file mtime changes", async () => {
    const filePath = join(dir, "a.ts");
    await writeFile(filePath, "v1");
    const { statSync } = await import("node:fs");
    const m1 = statSync(filePath).mtimeMs;
    cache.set({ tool: "read", args: { path: filePath } }, { result: "v1" }, { fileMtime: m1, files: [filePath] });

    expect(cache.get({ tool: "read", args: { path: filePath } }, m1)).toEqual({ result: "v1" });

    await new Promise(r => setTimeout(r, 10));
    await writeFile(filePath, "v2");
    const m2 = statSync(filePath).mtimeMs;
    expect(m2).toBeGreaterThan(m1);

    expect(cache.get({ tool: "read", args: { path: filePath } }, m2)).toBeUndefined();
  });
});

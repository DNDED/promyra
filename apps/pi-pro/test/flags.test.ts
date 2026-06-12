import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFlagsFromEnv, formatFlagsStatus } from "../src/flags.js";

describe("readFlagsFromEnv", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.PROMYRA_CACHE;
    delete process.env.PROMYRA_REPO_MAP;
    delete process.env.PROMYRA_CASCADE;
    delete process.env.PROMYRA_PARALLEL_TOOLS;
    delete process.env.PROMYRA_TELEMETRY;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("defaults all flags to ON when no env vars set", () => {
    const f = readFlagsFromEnv();
    expect(f.cache).toBe(true);
    expect(f.repoMap).toBe(true);
    expect(f.cascade).toBe(true);
    expect(f.parallelTools).toBe(true);
    expect(f.telemetry).toBe(true);
  });

  it("disables cache when PROMYRA_CACHE=0", () => {
    process.env.PROMYRA_CACHE = "0";
    expect(readFlagsFromEnv().cache).toBe(false);
  });

  it("disables cache when PROMYRA_CACHE=false", () => {
    process.env.PROMYRA_CACHE = "false";
    expect(readFlagsFromEnv().cache).toBe(false);
  });

  it("disables cache when PROMYRA_CACHE=no", () => {
    process.env.PROMYRA_CACHE = "no";
    expect(readFlagsFromEnv().cache).toBe(false);
  });

  it("disables cache when PROMYRA_CACHE=off", () => {
    process.env.PROMYRA_CACHE = "off";
    expect(readFlagsFromEnv().cache).toBe(false);
  });

  it("respects each flag independently", () => {
    process.env.PROMYRA_CASCADE = "0";
    process.env.PROMYRA_PARALLEL_TOOLS = "0";
    const f = readFlagsFromEnv();
    expect(f.cascade).toBe(false);
    expect(f.parallelTools).toBe(false);
    expect(f.cache).toBe(true);
    expect(f.repoMap).toBe(true);
    expect(f.telemetry).toBe(true);
  });

  it("is case-insensitive", () => {
    process.env.PROMYRA_CACHE = "FALSE";
    expect(readFlagsFromEnv().cache).toBe(false);
    process.env.PROMYRA_CACHE = "True";
    expect(readFlagsFromEnv().cache).toBe(true);
  });
});

describe("formatFlagsStatus", () => {
  it("renders all-on", () => {
    const s = formatFlagsStatus({ cache: true, repoMap: true, cascade: true, parallelTools: true, telemetry: true });
    expect(s).toContain("cache: ON");
    expect(s).toContain("telemetry: ON");
  });

  it("renders mixed", () => {
    const s = formatFlagsStatus({ cache: false, repoMap: true, cascade: true, parallelTools: false, telemetry: true });
    expect(s).toContain("cache: off");
    expect(s).toContain("parallelTools: off");
    expect(s).toContain("repoMap: ON");
  });
});

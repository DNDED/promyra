import { describe, it, expect, afterEach } from "vitest";
import { detectRuntime, detectRuntimes, formatRuntime } from "../src/util/runtime-detect.js";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let dirs: string[] = [];
function tmpCwd(): string {
  const d = mkdtempSync(join(tmpdir(), "pi-runtime-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs) {
    if (require("node:fs").existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
  dirs = [];
});

describe("detectRuntime", () => {
  it("detects Node via package.json", () => {
    const cwd = tmpCwd();
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "x" }));
    const r = detectRuntime(cwd);
    expect(r?.name).toBe("node");
  });

  it("extracts Node version from engines", () => {
    const cwd = tmpCwd();
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ engines: { node: ">=20.0.0" } }));
    const r = detectRuntime(cwd);
    expect(r?.name).toBe("node");
    expect(r?.version).toBe(">=20.0.0");
  });

  it("detects Go via go.mod", () => {
    const cwd = tmpCwd();
    writeFileSync(join(cwd, "go.mod"), "module example.com/x\n\ngo 1.21");
    expect(detectRuntime(cwd)?.name).toBe("go");
  });

  it("detects Rust via Cargo.toml", () => {
    const cwd = tmpCwd();
    writeFileSync(join(cwd, "Cargo.toml"), '[package]\nname = "x"');
    expect(detectRuntime(cwd)?.name).toBe("rust");
  });

  it("detects Python via pyproject.toml", () => {
    const cwd = tmpCwd();
    writeFileSync(join(cwd, "pyproject.toml"), '[project]\nname = "x"');
    expect(detectRuntime(cwd)?.name).toBe("python");
  });

  it("detects Python via requirements.txt", () => {
    const cwd = tmpCwd();
    writeFileSync(join(cwd, "requirements.txt"), "flask>=2.0");
    expect(detectRuntime(cwd)?.name).toBe("python");
  });

  it("detects Bun via bun.lock", () => {
    const cwd = tmpCwd();
    writeFileSync(join(cwd, "bun.lock"), "");
    expect(detectRuntime(cwd)?.name).toBe("bun");
  });

  it("detects Ruby via Gemfile", () => {
    const cwd = tmpCwd();
    writeFileSync(join(cwd, "Gemfile"), 'source "https://rubygems.org"');
    expect(detectRuntime(cwd)?.name).toBe("ruby");
  });

  it("detects CMake via CMakeLists.txt", () => {
    const cwd = tmpCwd();
    writeFileSync(join(cwd, "CMakeLists.txt"), "cmake_minimum_required");
    expect(detectRuntime(cwd)?.name).toBe("cmake");
  });

  it("returns null for empty dir", () => {
    expect(detectRuntime(tmpCwd())).toBeNull();
  });
});

describe("detectRuntimes (multi)", () => {
  it("returns multiple when present (node + python)", () => {
    const cwd = tmpCwd();
    writeFileSync(join(cwd, "package.json"), "{}");
    writeFileSync(join(cwd, "pyproject.toml"), "[project]");
    const r = detectRuntimes(cwd);
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.some((x) => x.name === "node")).toBe(true);
    expect(r.some((x) => x.name === "python")).toBe(true);
  });
});

describe("formatRuntime", () => {
  it("with version", () => {
    expect(formatRuntime({ name: "node", version: "20.0.0" })).toBe("via node 20.0.0");
  });
  it("without version", () => {
    expect(formatRuntime({ name: "go", version: null })).toBe("via go");
  });
});

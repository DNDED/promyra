import { describe, it, expect, afterEach } from "vitest";
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  applyEnvOverrides,
  mergeConfig,
  getDefaultModes,
  validateConfig,
  DEFAULT_CONFIG,
  cycleMode,
  getMode,
  listModes,
  type PiConfig,
} from "../src/index.js";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let dirs: string[] = [];
function tmpFile(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pi-pro-config-${Date.now()}-${Math.random().toString(36).slice(2)}`));
  dirs.push(dir);
  return join(dir, name);
}
afterEach(() => {
  for (const d of dirs) {
    if (require("node:fs").existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
  dirs = [];
});

describe("loadConfig", () => {
  it("returns defaults when file is missing", () => {
    const cfg = loadConfig("/nonexistent/pi.json");
    expect(cfg.version).toBe(1);
    expect(cfg.provider.name).toBe(DEFAULT_CONFIG.provider.name);
  });

  it("reads valid JSON config from path", () => {
    const path = tmpFile("cfg.json");
    const written: PiConfig = { ...DEFAULT_CONFIG, provider: { name: "openai", model: "gpt-4o" } };
    writeFileSync(path, JSON.stringify(written), "utf8");
    const cfg = loadConfig(path);
    expect(cfg.provider.name).toBe("openai");
    expect(cfg.provider.model).toBe("gpt-4o");
  });

  it("falls back to defaults if file is corrupted", () => {
    const path = tmpFile("bad.json");
    writeFileSync(path, "{ not valid json", "utf8");
    const cfg = loadConfig(path);
    expect(cfg.version).toBe(1);
  });

  it("uses getConfigPath() default", () => {
    expect(getConfigPath()).toContain("pi.json");
  });
});

describe("saveConfig", () => {
  it("writes a valid config file", () => {
    const path = tmpFile("pi.json");
    const cfg = { ...DEFAULT_CONFIG, provider: { ...DEFAULT_CONFIG.provider, model: "gpt-4o" } };
    saveConfig(cfg, path);
    const round = JSON.parse(require("node:fs").readFileSync(path, "utf8"));
    expect(round.provider.model).toBe("gpt-4o");
  });

  it("round-trips through loadConfig", () => {
    const path = tmpFile("pi.json");
    const cfg = { ...DEFAULT_CONFIG, agent: { ...DEFAULT_CONFIG.agent, name: "plan" } };
    saveConfig(cfg, path);
    const loaded = loadConfig(path);
    expect(loaded.agent.name).toBe("plan");
  });

  it("uses atomic write (temp + rename), no partial files", () => {
    const path = tmpFile("pi.json");
    saveConfig({ ...DEFAULT_CONFIG, version: 1 as const }, path);
    const leftover = join(require("node:path").dirname(path), "pi.json.tmp");
    expect(require("node:fs").existsSync(leftover)).toBe(false);
  });

  it("creates parent dirs if missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-pro-config-nested-"));
    dirs.push(dir);
    const path = join(dir, "deep", "nested", "pi.json");
    saveConfig(DEFAULT_CONFIG, path);
    expect(require("node:fs").existsSync(path)).toBe(true);
  });
});

describe("validateConfig", () => {
  it("accepts DEFAULT_CONFIG", () => {
    expect(validateConfig(DEFAULT_CONFIG).ok).toBe(true);
  });

  it("rejects unknown version", () => {
    const result = validateConfig({ ...DEFAULT_CONFIG, version: 99 as never });
    expect(result.ok).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = validateConfig({ version: 1 } as never);
    expect(result.ok).toBe(false);
  });

  it("accepts custom modes", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      modes: [
        { name: "review", label: "REVIEW", activeTools: ["read"], readOnly: true },
      ],
    };
    expect(validateConfig(cfg).ok).toBe(true);
  });
});

describe("mergeConfig", () => {
  it("returns base when override is empty", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {});
    expect(merged.version).toBe(DEFAULT_CONFIG.version);
  });

  it("override replaces top-level scalar", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { version: 1 });
    expect(merged.version).toBe(1);
  });

  it("override replaces nested object deeply", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { provider: { name: "openai", model: "gpt-4o" } });
    expect(merged.provider.name).toBe("openai");
    expect(merged.provider.model).toBe("gpt-4o");
  });
});

describe("applyEnvOverrides", () => {
  it("returns base when no env vars set", () => {
    const result = applyEnvOverrides(DEFAULT_CONFIG, {});
    expect(result.version).toBe(DEFAULT_CONFIG.version);
  });

  it("overrides model from env", () => {
    const result = applyEnvOverrides(DEFAULT_CONFIG, { PI_MODEL: "gpt-4o" });
    expect(result.provider.model).toBe("gpt-4o");
  });

  it("overrides agent name from env", () => {
    const result = applyEnvOverrides(DEFAULT_CONFIG, { PI_AGENT: "plan" });
    expect(result.agent.name).toBe("plan");
  });
});

describe("agent modes — defaults", () => {
  it("getDefaultModes returns build + plan", () => {
    const modes = getDefaultModes();
    expect(modes.find((m) => m.name === "build")).toBeDefined();
    expect(modes.find((m) => m.name === "plan")).toBeDefined();
  });

  it("build mode is full access", () => {
    const modes = getDefaultModes();
    const build = modes.find((m) => m.name === "build")!;
    expect(build.readOnly).toBe(false);
  });

  it("plan mode is read-only with limited tools", () => {
    const modes = getDefaultModes();
    const plan = modes.find((m) => m.name === "plan")!;
    expect(plan.readOnly).toBe(true);
    expect(plan.activeTools).toContain("read");
    expect(plan.activeTools).not.toContain("write");
  });
});

describe("agent modes — cycle", () => {
  it("cycles build → plan", () => {
    expect(cycleMode("build")).toBe("plan");
  });
  it("cycles plan → build (wraps)", () => {
    expect(cycleMode("plan")).toBe("build");
  });
  it("returns first mode for unknown input", () => {
    expect(cycleMode("nonexistent")).toBe("build");
  });
});

describe("agent modes — lookup", () => {
  it("getMode returns mode by name", () => {
    const m = getMode("build");
    expect(m?.name).toBe("build");
    expect(m?.readOnly).toBe(false);
  });
  it("getMode returns undefined for unknown", () => {
    expect(getMode("nonexistent")).toBeUndefined();
  });
  it("listModes returns all default modes", () => {
    const modes = listModes();
    expect(modes.length).toBe(2);
  });
});

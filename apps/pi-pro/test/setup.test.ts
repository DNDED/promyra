import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpHome = mkdtempSync(join(tmpdir(), "pi-setup-test-"));

beforeEach(() => {
  process.env.PI_HOME_OVERRIDE = tmpHome;
  vi.resetModules();
  mkdirSync(join(tmpHome, ".pi"), { recursive: true });
});

afterEach(() => {
  delete process.env.PI_HOME_OVERRIDE;
  vi.resetModules();
  rmSync(tmpHome, { recursive: true, force: true });
});

describe("pi setup", () => {
  it("writes config + auth with non-interactive flags", async () => {
    const { setup } = await import("../src/commands/setup.js");
    await setup({
      nonInteractive: true,
      provider: "opencode-go",
      model: "minimax-m3",
      apiKey: "sk-test-setup-key",
    });

    const configPath = join(tmpHome, ".pi", "pi-config.json");
    const authPath = join(tmpHome, ".pi", "pi-auth.json");
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(authPath)).toBe(true);

    const cfg = JSON.parse(readFileSync(configPath, "utf8"));
    expect(cfg.provider).toBe("opencode-go");
    expect(cfg.model).toBe("minimax-m3");

    const auth = JSON.parse(readFileSync(authPath, "utf8"));
    expect(auth["opencode-go"]).toBe("sk-test-setup-key");
  });

  it("writes config without baseUrl when not provided", async () => {
    const { setup } = await import("../src/commands/setup.js");
    await setup({
      nonInteractive: true,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "sk-test-anthropic",
    });

    const cfg = JSON.parse(readFileSync(join(tmpHome, ".pi", "pi-config.json"), "utf8"));
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.model).toBe("claude-sonnet-4-6");
    expect("baseUrl" in cfg).toBe(false);
  });

  it("config file is chmod 0600", async () => {
    const { setup } = await import("../src/commands/setup.js");
    await setup({
      nonInteractive: true,
      provider: "opencode-go",
      model: "minimax-m3",
      apiKey: "sk-test",
    });
    const { statSync } = await import("node:fs");
    const s = statSync(join(tmpHome, ".pi", "pi-config.json"));
    // mode & 0o777 === 0o600
    expect((s.mode & 0o777) === 0o600).toBe(true);
  });
});

describe("pi interactive", () => {
  it("interactive function is exported", async () => {
    const mod = await import("../src/commands/setup.js");
    expect(typeof mod.interactive).toBe("function");
  });

  it("setup function is exported", async () => {
    const mod = await import("../src/commands/setup.js");
    expect(typeof mod.setup).toBe("function");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpHome = join(tmpdir(), `pi-config-test-${Date.now()}`);

beforeEach(async () => {
  await mkdir(join(tmpHome, ".pi"), { recursive: true });
  process.env.PI_HOME_OVERRIDE = tmpHome;
  vi.resetModules();
});

afterEach(async () => {
  await rm(tmpHome, { recursive: true, force: true });
  delete process.env.PI_HOME_OVERRIDE;
  vi.resetModules();
});

describe("pi config command", () => {
  it("shows default config when nothing set", async () => {
    const { config } = await import("../src/commands/config.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await config();
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("provider:");
    expect(out).toContain("opencode-go");
    expect(out).toContain("model:");
    log.mockRestore();
  });

  it("set action updates model", async () => {
    const { config } = await import("../src/commands/config.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await config("set", "model", "minimax-m3");
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("model = minimax-m3");
    log.mockRestore();
  });

  it("set action updates provider", async () => {
    const { config } = await import("../src/commands/config.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await config("set", "provider", "anthropic");
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("provider = anthropic");
    log.mockRestore();
  });

  it("set action updates baseUrl", async () => {
    const { config } = await import("../src/commands/config.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await config("set", "baseUrl", "https://api.example.com");
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("baseUrl");
    log.mockRestore();
  });

  it("set action errors on missing key", async () => {
    const { config } = await import("../src/commands/config.js");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await config("set", undefined, "value");
    expect(err).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
    err.mockRestore();
    exit.mockRestore();
  });

  it("set-key action writes api key", async () => {
    const { config } = await import("../src/commands/config.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await config("set-key", "opencode-go", "sk-test-123");
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("key set");
    log.mockRestore();
  });

  it("default-model shows default for provider", async () => {
    const { config } = await import("../src/commands/config.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await config("default-model", "opencode-go");
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("opencode-go");
    expect(out).toContain("default");
    log.mockRestore();
  });

  it("unknown action errors", async () => {
    const { config } = await import("../src/commands/config.js");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    await config("bogus");
    expect(err).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
    err.mockRestore();
    exit.mockRestore();
  });
});

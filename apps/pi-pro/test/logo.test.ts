import { describe, it, expect } from "vitest";
import { banner, PI_LOGO, PI_TAGLINE } from "../src/logo.js";
import { PI_CONFIG_PATH, PI_AUTH_PATH, piHome } from "../src/config-paths.js";
import { join } from "node:path";
import { homedir } from "node:os";

describe("pi logo", () => {
  it("PI_LOGO is multiline ASCII art", () => {
    expect(PI_LOGO).toContain("____");
    expect(PI_LOGO.split("\n")).toHaveLength(5);
  });

  it("PI_TAGLINE is 'coding agent'", () => {
    expect(PI_TAGLINE).toBe("coding agent");
  });

  it("banner includes version", () => {
    const b = banner("0.1.0");
    expect(b).toContain("0.1.0");
  });

  it("banner includes model when provided", () => {
    const b = banner("0.1.0", "minimax-m3");
    expect(b).toContain("minimax-m3");
  });

  it("banner includes logo", () => {
    const b = banner("0.1.0");
    expect(b).toContain(PI_LOGO.split("\n")[0]);
  });
});

describe("pi config paths", () => {
  it("PI_CONFIG_PATH is in ~/.pi/", () => {
    expect(PI_CONFIG_PATH).toBe(join(homedir(), ".pi", "pi-config.json"));
  });

  it("PI_AUTH_PATH is in ~/.pi/", () => {
    expect(PI_AUTH_PATH).toBe(join(homedir(), ".pi", "pi-auth.json"));
  });

  it("piHome respects PI_HOME_OVERRIDE env var (adds .pi/)", () => {
    process.env.PI_HOME_OVERRIDE = "/tmp/pi-test";
    expect(piHome()).toBe("/tmp/pi-test/.pi");
    delete process.env.PI_HOME_OVERRIDE;
  });

  it("piHome defaults to ~/.pi/ when no override", () => {
    delete process.env.PI_HOME_OVERRIDE;
    expect(piHome()).toBe(join(homedir(), ".pi"));
  });

  it("pi paths are separate from pi-pro", () => {
    expect(PI_CONFIG_PATH).not.toContain(".pi-pro");
    expect(PI_AUTH_PATH).not.toContain(".pi-pro");
  });
});

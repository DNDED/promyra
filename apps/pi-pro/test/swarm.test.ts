import { describe, it, expect } from "vitest";
import { listMulticaAgents } from "../src/commands/swarm.js";

describe("pi swarm", () => {
  it("lists 8 multica named agents", () => {
    const agents = listMulticaAgents();
    expect(agents).toHaveLength(8);
  });

  it("includes all expected agent names", () => {
    const agents = listMulticaAgents();
    for (const name of ["jorvis", "jouono", "scout", "summit", "quill", "surge", "cipher", "forge"]) {
      expect(agents).toContain(name);
    }
  });

  it("agent names are lowercase", () => {
    for (const a of listMulticaAgents()) {
      expect(a).toBe(a.toLowerCase());
    }
  });
});

import { describe, it, expect } from "vitest";
import { LlmBenchRunner } from "@pi/bench";
import { createProvider } from "@pi/provider";

const FIXTURES = "/home/trader/Developer/pi-pro/bench/fixtures";

describe("pi bench", () => {
  it("LlmBenchRunner is exported from @pi/bench", () => {
    expect(typeof LlmBenchRunner).toBe("function");
  });

  it("LlmBenchRunner can be constructed", () => {
    const provider = createProvider({ apiKey: "sk-test", defaultModel: "minimax-m3" });
    const runner = new LlmBenchRunner(provider, {
      workspaceRoot: "/tmp/pi-bench-test",
      model: "minimax-m3",
      benchFixturesRel: FIXTURES,
    });
    expect(runner).toBeInstanceOf(LlmBenchRunner);
  });

  it("LlmBenchRunner accepts pipeline option", () => {
    const provider = createProvider({ apiKey: "sk-test", defaultModel: "minimax-m3" });
    const runner = new LlmBenchRunner(provider, {
      workspaceRoot: "/tmp/pi-bench-test",
      model: "minimax-m3",
      benchFixturesRel: FIXTURES,
      usePipeline: true,
    });
    expect(runner).toBeInstanceOf(LlmBenchRunner);
  });

  it("LlmBenchRunner accepts modelMap", () => {
    const provider = createProvider({ apiKey: "sk-test", defaultModel: "minimax-m3" });
    const runner = new LlmBenchRunner(provider, {
      workspaceRoot: "/tmp/pi-bench-test",
      model: "minimax-m3",
      benchFixturesRel: FIXTURES,
      modelMap: { hard: "deepseek-v4-pro", easy: "deepseek-v4-flash" },
    });
    expect(runner).toBeInstanceOf(LlmBenchRunner);
  });
});

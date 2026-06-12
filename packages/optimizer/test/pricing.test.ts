import { describe, it, expect } from "vitest";
import { estimateCost, resolveCascadeModel, PRICING } from "../src/pricing.js";

describe("estimateCost", () => {
  it("returns 0 for zero tokens", () => {
    expect(estimateCost("claude-sonnet-4-5", 0, 0)).toBe(0);
  });

  it("computes USD for input tokens at Anthropic Sonnet pricing", () => {
    // 1M input tokens @ $3.00/M = $3.00
    const c = estimateCost("claude-sonnet-4-5", 1_000_000, 0);
    expect(c).toBeCloseTo(3.00, 4);
  });

  it("computes USD for output tokens at Anthropic Sonnet pricing", () => {
    // 1M output @ $15.00/M = $15.00
    const c = estimateCost("claude-sonnet-4-5", 0, 1_000_000);
    expect(c).toBeCloseTo(15.00, 4);
  });

  it("applies cache read discount (10% of input)", () => {
    // 1M input, 800k cache read → 200k billable @ $3/M + 800k @ $0.30/M
    const c = estimateCost("claude-sonnet-4-5", 1_000_000, 0, 800_000);
    const expected = (200_000 * 3.00) / 1_000_000 + (800_000 * 0.30) / 1_000_000;
    expect(c).toBeCloseTo(expected, 4);
  });

  it("applies cache write uplift (1.25x input)", () => {
    // 1M input, 100k cache write → 900k billable input + 100k @ $3.75/M
    const c = estimateCost("claude-sonnet-4-5", 1_000_000, 0, 0, 100_000);
    const expected = (900_000 * 3.00) / 1_000_000 + (100_000 * 3.75) / 1_000_000;
    expect(c).toBeCloseTo(expected, 4);
  });

  it("uses fallback pricing for unknown models", () => {
    // Fallback: input $1/M, output $3/M
    const c = estimateCost("unknown-model-xyz", 1_000_000, 1_000_000);
    expect(c).toBeCloseTo(1.00 + 3.00, 4);
  });

  it("returns 0 for local/free models", () => {
    expect(estimateCost("llama3", 1_000_000, 1_000_000)).toBe(0);
  });
});

describe("resolveCascadeModel", () => {
  it("returns claude-haiku-4-5 for Anthropic", () => {
    expect(resolveCascadeModel("anthropic", "claude-sonnet-4-5")).toBe("claude-haiku-4-5");
  });

  it("returns gpt-5-mini for OpenAI", () => {
    expect(resolveCascadeModel("openai", "gpt-5")).toBe("gpt-5-mini");
  });

  it("returns deepseek-v4-flash for opencode-go when main is deepseek-v4-pro", () => {
    expect(resolveCascadeModel("opencode-go", "deepseek-v4-pro")).toBe("deepseek-v4-flash");
  });

  it("returns sonnet for opencode-go when main is opus", () => {
    expect(resolveCascadeModel("opencode-go", "claude-opus-4-7")).toBe("claude-sonnet-4-6");
  });

  it("returns main model when no cheaper variant known", () => {
    expect(resolveCascadeModel("opencode-go", "minimax-m3")).toBe("minimax-m3");
  });
});

describe("PRICING table", () => {
  it("has entries for all expected models", () => {
    const expected = [
      "claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-5",
      "gpt-5", "gpt-5-mini", "gpt-4o",
      "deepseek-v4-flash", "deepseek-v4-pro",
      "kimi-k2.5", "kimi-k2.6",
      "qwen3.6-plus", "qwen3.7-plus", "qwen3.7-max",
      "mimo-v2.5", "mimo-v2.5-pro",
      "glm-5", "glm-5.1",
      "minimax-m3", "minimax-m2.7", "minimax-m2.5",
    ];
    for (const m of expected) {
      expect(PRICING[m]).toBeDefined();
      expect(PRICING[m].input).toBeGreaterThanOrEqual(0);
      expect(PRICING[m].output).toBeGreaterThanOrEqual(0);
      expect(PRICING[m].cacheRead).toBeGreaterThanOrEqual(0);
      expect(PRICING[m].cacheWrite).toBeGreaterThanOrEqual(0);
    }
  });
});

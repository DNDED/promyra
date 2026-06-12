import { describe, it, expect } from "vitest";
import { isAnthropicModel, createProvider, OpenCodeGoProvider, OpenAIProvider } from "@pi/provider";

describe("pi model router", () => {
  it("routes Anthropic models to OpenCodeGoProvider", () => {
    const p = createProvider({ apiKey: "sk-test", defaultModel: "minimax-m3" });
    expect(p).toBeInstanceOf(OpenCodeGoProvider);
  });

  it("routes all 5 minimax variants as Anthropic", () => {
    for (const m of ["minimax-m3", "minimax-m2.7", "minimax-m2.5", "qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus"]) {
      expect(isAnthropicModel(m)).toBe(true);
      const p = createProvider({ apiKey: "sk-test", defaultModel: m });
      expect(p).toBeInstanceOf(OpenCodeGoProvider);
    }
  });

  it("routes OpenAI models to OpenAIProvider", () => {
    for (const m of ["deepseek-v4-pro", "deepseek-v4-flash", "kimi-k2.5", "kimi-k2.6", "mimo-v2.5", "mimo-v2.5-pro", "glm-5", "glm-5.1"]) {
      expect(isAnthropicModel(m)).toBe(false);
      const p = createProvider({ apiKey: "sk-test", defaultModel: m });
      expect(p).toBeInstanceOf(OpenAIProvider);
    }
  });

  it("unknown model defaults to OpenAI (defensive)", () => {
    const p = createProvider({ apiKey: "sk-test", defaultModel: "unknown-model-xyz" });
    expect(p).toBeInstanceOf(OpenAIProvider);
  });

  it("respects baseUrl override", () => {
    const p = createProvider({ apiKey: "sk-test", defaultModel: "minimax-m3", baseUrl: "https://custom.example.com" });
    expect(p).toBeInstanceOf(OpenCodeGoProvider);
  });
});

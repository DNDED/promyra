/**
 * v0.5.0 pricing table.
 *
 * USD per 1M tokens. Cache reads are 10% of base input; cache writes
 * are 1.25x base input (Anthropic convention). Override per-model
 * via the PRICING map below; can be extended at runtime via config.
 */

export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-haiku-4-5": { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 1.00 },
  "claude-sonnet-4-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "claude-opus-4-5": { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  "claude-opus-4-7": { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  // OpenAI
  "gpt-5": { input: 2.50, output: 10.00, cacheRead: 0.25, cacheWrite: 3.125 },
  "gpt-5-mini": { input: 0.25, output: 2.00, cacheRead: 0.025, cacheWrite: 0.30 },
  "gpt-4o": { input: 5.00, output: 15.00, cacheRead: 0.50, cacheWrite: 6.25 },
  // OpenCode Go (Anthropic-protocol via opencode.ai/zen/go)
  "deepseek-v4-flash": { input: 0.14, output: 0.28, cacheRead: 0.014, cacheWrite: 0.175 },
  "deepseek-v4-pro": { input: 0.55, output: 2.19, cacheRead: 0.055, cacheWrite: 0.69 },
  "kimi-k2.5": { input: 0.50, output: 2.00, cacheRead: 0.05, cacheWrite: 0.625 },
  "kimi-k2.6": { input: 0.60, output: 2.50, cacheRead: 0.06, cacheWrite: 0.75 },
  "qwen3.6-plus": { input: 0.40, output: 1.60, cacheRead: 0.04, cacheWrite: 0.50 },
  "qwen3.7-plus": { input: 0.45, output: 1.80, cacheRead: 0.045, cacheWrite: 0.56 },
  "qwen3.7-max": { input: 1.20, output: 4.80, cacheRead: 0.12, cacheWrite: 1.50 },
  "mimo-v2.5": { input: 0.30, output: 1.20, cacheRead: 0.03, cacheWrite: 0.375 },
  "mimo-v2.5-pro": { input: 0.80, output: 3.20, cacheRead: 0.08, cacheWrite: 1.00 },
  "glm-5": { input: 0.60, output: 2.20, cacheRead: 0.06, cacheWrite: 0.75 },
  "glm-5.1": { input: 0.65, output: 2.40, cacheRead: 0.065, cacheWrite: 0.81 },
  "minimax-m3": { input: 0.30, output: 1.20, cacheRead: 0.03, cacheWrite: 0.40 },
  "minimax-m2.7": { input: 0.25, output: 1.00, cacheRead: 0.025, cacheWrite: 0.31 },
  "minimax-m2.5": { input: 0.20, output: 0.80, cacheRead: 0.02, cacheWrite: 0.25 },
  // Ollama / local — assume free
  "llama3": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

const FALLBACK: ModelPricing = { input: 1.00, output: 3.00, cacheRead: 0.10, cacheWrite: 1.25 };

export function estimateCost(
  model: string,
  inTokens: number,
  outTokens: number,
  cacheRead: number = 0,
  cacheWrite: number = 0,
): number {
  const p = PRICING[model] ?? FALLBACK;
  // inTokens is the TOTAL input token count, including any cache reads
  // and cache writes. The regular (non-cached) input is what's left.
  const regular = Math.max(0, inTokens - cacheRead - cacheWrite);
  const usd =
    (regular * p.input) / 1_000_000 +
    (outTokens * p.output) / 1_000_000 +
    (cacheRead * p.cacheRead) / 1_000_000 +
    (cacheWrite * p.cacheWrite) / 1_000_000;
  return usd;
}

/**
 * Cheap (cascade) model resolution. Per spec §4.4.1: Anthropic → Haiku,
 * OpenAI → mini, opencode-go → deepseek-v4-flash.
 */
export function resolveCascadeModel(provider: string, mainModel: string): string {
  switch (provider) {
    case "anthropic":
      return "claude-haiku-4-5";
    case "openai":
      return "gpt-5-mini";
    case "opencode-go":
    case "openrouter":
    case "ollama":
    default:
      // For opencode-go / openrouter / ollama, prefer a sub-main
      // model if we know one; else fall back to the main model.
      if (mainModel === "deepseek-v4-pro") return "deepseek-v4-flash";
      if (mainModel === "claude-sonnet-4-6" || mainModel === "claude-sonnet-4-5") return "claude-haiku-4-5";
      if (mainModel === "claude-opus-4-5" || mainModel === "claude-opus-4-7") return "claude-sonnet-4-6";
      if (mainModel === "gpt-5") return "gpt-5-mini";
      if (mainModel === "qwen3.7-max") return "qwen3.6-plus";
      if (mainModel === "mimo-v2.5-pro") return "mimo-v2.5";
      if (mainModel === "glm-5.1") return "glm-5";
      return mainModel; // unknown; use main
  }
}

import { Provider } from "./types.js";
import { OpenCodeGoProvider } from "./opencode-go.js";
import { OpenAIProvider } from "./openai-compat.js";

const ANTHROPIC_MODELS = new Set([
  "minimax-m3", "minimax-m2.7", "minimax-m2.5",
  "qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus",
]);

const OPENAI_MODELS = new Set([
  "deepseek-v4-pro", "deepseek-v4-flash",
  "kimi-k2.5", "kimi-k2.6",
  "mimo-v2.5", "mimo-v2.5-pro",
  "glm-5", "glm-5.1",
]);

export interface ModelRouterOpts {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

export function createProvider(opts: ModelRouterOpts): Provider {
  const model = opts.defaultModel ?? "deepseek-v4-flash";
  const baseUrl = opts.baseUrl ?? "https://opencode.ai/zen/go";

  if (ANTHROPIC_MODELS.has(model)) {
    return new OpenCodeGoProvider({ apiKey: opts.apiKey, model, baseUrl });
  }
  if (OPENAI_MODELS.has(model)) {
    return new OpenAIProvider({ apiKey: opts.apiKey, model, baseUrl });
  }
  return new OpenAIProvider({ apiKey: opts.apiKey, model, baseUrl });
}

export function isAnthropicModel(model: string): boolean {
  return ANTHROPIC_MODELS.has(model);
}

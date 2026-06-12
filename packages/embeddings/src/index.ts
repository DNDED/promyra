import type { EmbeddingsProvider, EmbeddingsProviderName, EmbeddingsOpts } from "./types.js";
import { AnthropicEmbeddings } from "./anthropic.js";
import { OpenAIEmbeddings } from "./openai.js";
import { OpenCodeGoEmbeddings } from "./opencode-go.js";
import { NullEmbeddings } from "./null.js";

export function createEmbeddings(
  name: EmbeddingsProviderName | string,
  opts: EmbeddingsOpts = {},
): EmbeddingsProvider {
  switch (name) {
    case "anthropic":
      return new AnthropicEmbeddings(opts);
    case "openai":
      return new OpenAIEmbeddings(opts);
    case "opencode-go":
      return new OpenCodeGoEmbeddings(opts);
    case "null":
      return new NullEmbeddings();
    default:
      throw new Error(`Unknown embeddings provider: ${name}`);
  }
}

export function defaultEmbeddings(opts: EmbeddingsOpts = {}): EmbeddingsProvider {
  if (process.env.OPENAI_API_KEY) return new OpenAIEmbeddings(opts);
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicEmbeddings(opts);
  if (process.env.OPENCODE_GO_API_KEY) return new OpenCodeGoEmbeddings(opts);
  return new NullEmbeddings();
}

export type { EmbeddingsProvider, EmbeddingsOpts, EmbeddingsProviderName } from "./types.js";
export { cosineSimilarity } from "./types.js";
export { NullEmbeddings } from "./null.js";
export { AnthropicEmbeddings, VOYAGE_3_DIM, VOYAGE_DEFAULT_MODEL } from "./anthropic.js";
export { OpenAIEmbeddings, OPENAI_SMALL_DIM, OPENAI_DEFAULT_MODEL } from "./openai.js";
export { OpenCodeGoEmbeddings, OPENCODE_GO_EMBED_DIM, OPENCODE_GO_DEFAULT_MODEL } from "./opencode-go.js";

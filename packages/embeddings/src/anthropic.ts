import type { EmbeddingsProvider, EmbeddingsOpts } from "./types.js";

export const VOYAGE_3_DIM = 1024;
export const VOYAGE_DEFAULT_MODEL = "voyage-3";

export class AnthropicEmbeddings implements EmbeddingsProvider {
  readonly name = "anthropic" as const;
  readonly dim: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly signal?: AbortSignal;

  constructor(opts: EmbeddingsOpts = {}) {
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.baseUrl = opts.baseUrl ?? "https://api.anthropic.com";
    this.model = opts.model ?? VOYAGE_DEFAULT_MODEL;
    this.dim = VOYAGE_3_DIM;
    this.fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.signal = opts.signal;
  }

  async embed(text: string): Promise<Float32Array> {
    const [vec] = await this.embedBatch([text]);
    return vec;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const res = await this.fetchFn(`${this.baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: this.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AnthropicEmbeddings: ${res.status} ${res.statusText} ${body}`);
    }
    const json = (await res.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return json.data.map((d) => Float32Array.from(d.embedding));
  }
}

import type { EmbeddingsProvider, EmbeddingsOpts } from "./types.js";

export const OPENCODE_GO_EMBED_DIM = 1024;
export const OPENCODE_GO_DEFAULT_MODEL = "voyage-3";

export class OpenCodeGoEmbeddings implements EmbeddingsProvider {
  readonly name = "opencode-go" as const;
  readonly dim: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly signal?: AbortSignal;

  constructor(opts: EmbeddingsOpts = {}) {
    this.apiKey = opts.apiKey ?? process.env.OPENCODE_GO_API_KEY ?? "";
    this.baseUrl = opts.baseUrl ?? "https://opencode.ai/zen/go";
    this.model = opts.model ?? OPENCODE_GO_DEFAULT_MODEL;
    this.dim = OPENCODE_GO_EMBED_DIM;
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
      throw new Error(`OpenCodeGoEmbeddings: ${res.status} ${res.statusText} ${body}`);
    }
    const json = (await res.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return json.data.map((d) => Float32Array.from(d.embedding));
  }
}

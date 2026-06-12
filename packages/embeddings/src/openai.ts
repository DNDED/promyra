import type { EmbeddingsProvider, EmbeddingsOpts } from "./types.js";

export const OPENAI_SMALL_DIM = 1536;
export const OPENAI_DEFAULT_MODEL = "text-embedding-3-small";

export class OpenAIEmbeddings implements EmbeddingsProvider {
  readonly name = "openai" as const;
  readonly dim: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly signal?: AbortSignal;

  constructor(opts: EmbeddingsOpts = {}) {
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = opts.baseUrl ?? "https://api.openai.com";
    this.model = opts.model ?? OPENAI_DEFAULT_MODEL;
    this.dim = OPENAI_SMALL_DIM;
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
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: this.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAIEmbeddings: ${res.status} ${res.statusText} ${body}`);
    }
    const json = (await res.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return json.data.map((d) => Float32Array.from(d.embedding));
  }
}

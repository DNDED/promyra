import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createEmbeddings,
  defaultEmbeddings,
  cosineSimilarity,
  NullEmbeddings,
  AnthropicEmbeddings,
  OpenAIEmbeddings,
  OpenCodeGoEmbeddings,
} from "../src/index.js";

function makeMockFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

function embeddingBody(embeddings: number[][]): unknown {
  return { data: embeddings.map((embedding) => ({ embedding })) };
}

function vec(n: number, ...values: number[]): number[] {
  const out = new Array(n).fill(0);
  for (let i = 0; i < values.length && i < n; i++) out[i] = values[i];
  return out;
}

let savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  savedEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENCODE_GO_API_KEY: process.env.OPENCODE_GO_API_KEY,
  };
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENCODE_GO_API_KEY;
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("createEmbeddings", () => {
  it("returns NullEmbeddings for 'null'", () => {
    const e = createEmbeddings("null");
    expect(e).toBeInstanceOf(NullEmbeddings);
    expect(e.name).toBe("null");
    expect(e.dim).toBe(0);
  });

  it("returns AnthropicEmbeddings for 'anthropic'", () => {
    const e = createEmbeddings("anthropic");
    expect(e).toBeInstanceOf(AnthropicEmbeddings);
    expect(e.name).toBe("anthropic");
    expect(e.dim).toBe(1024);
  });

  it("returns OpenAIEmbeddings for 'openai'", () => {
    const e = createEmbeddings("openai");
    expect(e).toBeInstanceOf(OpenAIEmbeddings);
    expect(e.name).toBe("openai");
    expect(e.dim).toBe(1536);
  });

  it("returns OpenCodeGoEmbeddings for 'opencode-go'", () => {
    const e = createEmbeddings("opencode-go");
    expect(e).toBeInstanceOf(OpenCodeGoEmbeddings);
    expect(e.name).toBe("opencode-go");
    expect(e.dim).toBe(1024);
  });

  it("throws on unknown provider", () => {
    expect(() => createEmbeddings("bogus")).toThrow(/Unknown embeddings provider/);
  });
});

describe("defaultEmbeddings", () => {
  it("prefers OpenAI when OPENAI_API_KEY set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(defaultEmbeddings().name).toBe("openai");
  });

  it("prefers Anthropic when only ANTHROPIC_API_KEY set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(defaultEmbeddings().name).toBe("anthropic");
  });

  it("prefers opencode-go when only OPENCODE_GO_API_KEY set", () => {
    process.env.OPENCODE_GO_API_KEY = "sk-test";
    expect(defaultEmbeddings().name).toBe("opencode-go");
  });

  it("falls back to NullEmbeddings when no key set", () => {
    expect(defaultEmbeddings()).toBeInstanceOf(NullEmbeddings);
  });
});

describe("NullEmbeddings", () => {
  it("returns zero-vector of dim 0", async () => {
    const e = new NullEmbeddings();
    const v = await e.embed("hello");
    expect(v).toBeInstanceOf(Float32Array);
    expect(v.length).toBe(0);
  });

  it("returns array of zero-vectors for embedBatch", async () => {
    const e = new NullEmbeddings();
    const vs = await e.embedBatch(["a", "b", "c"]);
    expect(vs).toHaveLength(3);
    for (const v of vs) expect(v.length).toBe(0);
  });
});

describe("AnthropicEmbeddings", () => {
  it("sends POST with correct headers + body to /v1/embeddings", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify(embeddingBody([vec(1024, 0.1, 0.2)])), { status: 200 }),
    ) as unknown as typeof fetch;
    const e = new AnthropicEmbeddings({ apiKey: "sk-test", fetchFn });
    const v = await e.embed("hello");
    expect(v.length).toBe(1024);
    expect(v[0]).toBeCloseTo(0.1);
    expect(v[1]).toBeCloseTo(0.2);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/embeddings");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("voyage-3");
    expect(body.input).toEqual(["hello"]);
  });

  it("embeds a batch in one call", async () => {
    const fetchFn = makeMockFetch(embeddingBody([vec(4, 1, 0, 0, 0), vec(4, 0, 1, 0, 0)]));
    const e = new AnthropicEmbeddings({ apiKey: "sk-test", fetchFn, model: "voyage-3" });
    const vs = await e.embedBatch(["a", "b"]);
    expect(vs).toHaveLength(2);
    expect(vs[0].length).toBe(4);
    expect(vs[1].length).toBe(4);
  });

  it("throws on non-2xx response", async () => {
    const fetchFn = makeMockFetch({ error: "bad" }, 401);
    const e = new AnthropicEmbeddings({ apiKey: "sk-test", fetchFn });
    await expect(e.embed("x")).rejects.toThrow(/AnthropicEmbeddings.*401/);
  });

  it("uses custom baseUrl", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify(embeddingBody([vec(4)])), { status: 200 }),
    ) as unknown as typeof fetch;
    const e = new AnthropicEmbeddings({ apiKey: "sk-test", fetchFn, baseUrl: "https://proxy.example.com" });
    await e.embed("hi");
    const [url] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("https://proxy.example.com/v1/embeddings");
  });

  it("uses process.env.ANTHROPIC_API_KEY as default", () => {
    process.env.ANTHROPIC_API_KEY = "sk-env";
    const e = new AnthropicEmbeddings();
    expect(e.name).toBe("anthropic");
  });
});

describe("OpenAIEmbeddings", () => {
  it("sends POST with Bearer auth to /v1/embeddings", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify(embeddingBody([vec(1536, 0.5)])), { status: 200 }),
    ) as unknown as typeof fetch;
    const e = new OpenAIEmbeddings({ apiKey: "sk-test", fetchFn });
    const v = await e.embed("hi");
    expect(v.length).toBe(1536);
    expect(v[0]).toBeCloseTo(0.5);
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("text-embedding-3-small");
  });

  it("returns empty array for empty input", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const e = new OpenAIEmbeddings({ apiKey: "sk-test", fetchFn });
    const vs = await e.embedBatch([]);
    expect(vs).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("throws on 429", async () => {
    const fetchFn = makeMockFetch({ error: "rate-limited" }, 429);
    const e = new OpenAIEmbeddings({ apiKey: "sk-test", fetchFn });
    await expect(e.embed("x")).rejects.toThrow(/OpenAIEmbeddings.*429/);
  });

  it("uses custom model when set", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify(embeddingBody([vec(4)])), { status: 200 }),
    ) as unknown as typeof fetch;
    const e = new OpenAIEmbeddings({ apiKey: "sk-test", fetchFn, model: "text-embedding-3-large" });
    await e.embed("hi");
    const [, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("text-embedding-3-large");
  });
});

describe("OpenCodeGoEmbeddings", () => {
  it("uses opencode.ai base URL by default", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify(embeddingBody([vec(1024, 0.7)])), { status: 200 }),
    ) as unknown as typeof fetch;
    const e = new OpenCodeGoEmbeddings({ apiKey: "sk-test", fetchFn });
    const v = await e.embed("hi");
    expect(v.length).toBe(1024);
    expect(v[0]).toBeCloseTo(0.7);
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://opencode.ai/zen/go/v1/embeddings");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("uses OPENCODE_GO_API_KEY env by default", () => {
    process.env.OPENCODE_GO_API_KEY = "sk-env";
    const e = new OpenCodeGoEmbeddings();
    expect(e.name).toBe("opencode-go");
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it("returns 0 for zero vector", () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("throws on dimension mismatch", () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(() => cosineSimilarity(a, b)).toThrow(/dimension mismatch/);
  });

  it("ranks similar vectors higher than dissimilar", () => {
    const a = new Float32Array([1, 1, 0, 0]);
    const similar = new Float32Array([1, 0.9, 0.1, 0]);
    const dissimilar = new Float32Array([0, 0, 1, 1]);
    const sSim = cosineSimilarity(a, similar);
    const dSim = cosineSimilarity(a, dissimilar);
    expect(sSim).toBeGreaterThan(dSim);
  });
});

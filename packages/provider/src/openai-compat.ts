import { Provider, Message, CallOpts, StreamChunk, Tool, ProviderConfig } from "./types.js";

interface OpenAIRequest {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string }>;
  max_tokens?: number;
  temperature?: number;
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  stream: true;
  prompt_cache_key?: string;
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

class OpenAICompatProvider implements Provider {
  readonly name: string;
  protected readonly apiKey: string | undefined;
  protected readonly baseUrl: string;
  protected readonly defaultModel: string;
  protected readonly requireAuth: boolean;

  constructor(name: string, cfg: ProviderConfig & { requireAuth?: boolean; defaultBaseUrl: string }) {
    this.name = name;
    this.requireAuth = cfg.requireAuth ?? true;
    if (this.requireAuth && !cfg.apiKey) {
      throw new Error(`${name} requires apiKey`);
    }
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? cfg.defaultBaseUrl;
    this.defaultModel = cfg.model;
  }

  async *complete(messages: Message[], opts: CallOpts): AsyncIterable<StreamChunk> {
    const chatMessages: OpenAIRequest["messages"] = [];
    for (const m of messages) {
      if (m.role === "system" || m.role === "user" || m.role === "assistant") {
        chatMessages.push({
          role: m.role,
          content: typeof m.content === "string" ? m.content : m.content.map(b => b.type === "text" ? b.text : "").join(""),
        });
      }
    }

    const body: OpenAIRequest = {
      model: opts.model ?? this.defaultModel,
      messages: chatMessages,
      stream: true,
    };
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools.map((t: Tool) => ({
        type: "function" as const,
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }
    if (opts.cacheHints?.cacheKey) {
      body.prompt_cache_key = opts.cacheHints.cacheKey;
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!res.ok) {
      throw new Error(`${this.name} ${res.status}: ${await res.text()}`);
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/event-stream") && res.body) {
      const raw = await res.text();
      if (raw && !raw.startsWith("data:") && raw.startsWith("{")) {
        const parsed = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }>; usage?: OpenAIUsage };
        const text = (parsed.choices ?? []).map(c => c.message?.content ?? "").join("");
        if (text) yield { type: "token", text };
        const usage = parsed.usage ?? {};
        yield {
          type: "done",
          usage: {
            in: usage.prompt_tokens ?? 0,
            out: usage.completion_tokens ?? 0,
            cacheReadTokens: usage.prompt_tokens_details?.cached_tokens,
          },
        };
        return;
      }
      if (raw && !raw.startsWith("data:")) {
        throw new Error(`${this.name} returned non-SSE response (content-type: ${ct}). Body: ${raw.slice(0, 200)}`);
      }
    }

    if (!res.body) {
      yield { type: "done", usage: { in: 0, out: 0 } };
      return;
    }

    let inTokens = 0;
    let outTokens = 0;
    let cacheRead = 0;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // Accumulator for streaming tool_call deltas. OpenAI's
    // tool_calls stream sends `tc.function.name` only on the first
    // delta and `tc.function.arguments` as a partial JSON string
    // across multiple deltas. We must concatenate arguments and
    // JSON.parse once when the tool call finishes (detected when
    // finish_reason === "tool_calls" on a delta with no tool_calls
    // payload, or when [DONE] is received).
    const toolAcc = new Map<number, { id: string; name: string; argsBuf: string; yielded: boolean }>();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") {
          // flush any incomplete tool calls on [DONE]
          for (const [, acc] of toolAcc) {
            if (!acc.yielded) {
              let args: unknown = {};
              if (acc.argsBuf) {
                try { args = JSON.parse(acc.argsBuf); } catch { args = {}; }
              }
              yield { type: "tool_call", id: acc.id, name: acc.name, args };
              acc.yielded = true;
            }
          }
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            yield { type: "token", text: parsed.choices[0].delta.content };
          }
          const tcs = parsed.choices?.[0]?.delta?.tool_calls;
          if (tcs && tcs.length > 0) {
            for (const tc of tcs) {
              const idx = tc.index ?? 0;
              let acc = toolAcc.get(idx);
              if (!acc) {
                acc = { id: "", name: "unknown", argsBuf: "", yielded: false };
                toolAcc.set(idx, acc);
              }
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name = tc.function.name;
              if (tc.function?.arguments) acc.argsBuf += tc.function.arguments;
            }
          }
          const finish = parsed.choices?.[0]?.finish_reason;
          if (finish === "tool_calls" || finish === "stop") {
            for (const [, acc] of toolAcc) {
              if (!acc.yielded && (acc.id || acc.argsBuf)) {
                let args: unknown = {};
                if (acc.argsBuf) {
                  try { args = JSON.parse(acc.argsBuf); } catch { args = {}; }
                }
                yield { type: "tool_call", id: acc.id, name: acc.name, args };
                acc.yielded = true;
              }
            }
          }
          if (parsed.usage) {
            inTokens = parsed.usage.prompt_tokens ?? inTokens;
            outTokens = parsed.usage.completion_tokens ?? outTokens;
            cacheRead = parsed.usage.prompt_tokens_details?.cached_tokens ?? cacheRead;
          }
        } catch { /* ignore */ }
      }
    }

    yield {
      type: "done",
      usage: {
        in: inTokens,
        out: outTokens,
        cacheReadTokens: cacheRead || undefined,
      },
    };
  }
}

export class OpenAIProvider extends OpenAICompatProvider {
  constructor(cfg: ProviderConfig & { baseUrl?: string }) {
    super("openai", { ...cfg, defaultBaseUrl: "https://api.openai.com", requireAuth: true });
  }
}

export class OllamaProvider extends OpenAICompatProvider {
  constructor(cfg: ProviderConfig & { baseUrl?: string }) {
    super("ollama", { ...cfg, defaultBaseUrl: "http://localhost:11434", requireAuth: false, apiKey: undefined });
  }
}

export class OpenRouterProvider extends OpenAICompatProvider {
  constructor(cfg: ProviderConfig & { baseUrl?: string }) {
    super("openrouter", { ...cfg, defaultBaseUrl: "https://openrouter.ai/api", requireAuth: true });
  }
}

import { Provider, Message, CallOpts, StreamChunk, Tool, ProviderConfig } from "./types.js";

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
  messages: Array<{ role: "user" | "assistant"; content: string | Array<Record<string, unknown>> }>;
  tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown>; cache_control?: { type: "ephemeral" } }>;
  temperature?: number;
  stream?: boolean;
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export class OpenCodeGoProvider implements Provider {
  readonly name = "opencode-go";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(cfg: ProviderConfig) {
    if (!cfg.apiKey) throw new Error("OpenCodeGoProvider requires apiKey");
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? "https://opencode.ai/zen/go";
    this.defaultModel = cfg.model;
  }

  async *complete(messages: Message[], opts: CallOpts): AsyncIterable<StreamChunk> {
    const systemParts: string[] = [];
    const chatMessages: AnthropicRequest["messages"] = [];
    for (const m of messages) {
      if (m.role === "system") {
        systemParts.push(typeof m.content === "string" ? m.content : m.content.map(b => b.type === "text" ? b.text : "").join(""));
      } else {
        chatMessages.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content as AnthropicRequest["messages"][number]["content"],
        });
      }
    }

    const cacheSystem = opts.cacheHints?.cacheSystem === true;
    const cacheTools = opts.cacheHints?.cacheTools === true;

    const body: AnthropicRequest = {
      model: opts.model ?? this.defaultModel,
      max_tokens: opts.maxTokens ?? 4096,
      messages: chatMessages,
    };
    if (systemParts.length > 0) {
      if (cacheSystem) {
        body.system = [{
          type: "text",
          text: systemParts.join("\n\n"),
          cache_control: { type: "ephemeral" },
        }];
      } else {
        body.system = systemParts.join("\n\n");
      }
    }
    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools.map((t: Tool) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
      if (cacheTools) {
        const last = body.tools[body.tools.length - 1];
        last.cache_control = { type: "ephemeral" };
      }
    }
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    body.stream = true;

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenCodeGo ${res.status}: ${text}`);
    }

    const ct = res.headers.get("content-type") ?? "";

    // If the server returned a non-streaming JSON response despite our
    // stream=true request, parse the single Anthropic message shape
    // and yield it as a single token + done. Some OpenCode Go
    // endpoints do this for short responses.
    if (!ct.includes("text/event-stream") && res.body) {
      const raw = await res.text();
      if (raw && !raw.startsWith("data:") && raw.startsWith("{")) {
        const parsed = JSON.parse(raw) as { content?: Array<{ type: string; text?: string }>; usage?: AnthropicUsage };
        const text = (parsed.content ?? []).filter(b => b.type === "text").map(b => b.text ?? "").join("");
        if (text) yield { type: "token", text };
        const usage = parsed.usage ?? {};
        yield {
          type: "done",
          usage: {
            in: usage.input_tokens ?? 0,
            out: usage.output_tokens ?? 0,
            cacheReadTokens: usage.cache_read_input_tokens,
            cacheWriteTokens: usage.cache_creation_input_tokens,
          },
        };
        return;
      }
      if (raw && !raw.startsWith("data:")) {
        throw new Error(`OpenCodeGo returned non-SSE response (content-type: ${ct}). Body: ${raw.slice(0, 200)}`);
      }
    }

    if (!res.body) {
      yield { type: "done", usage: { in: 0, out: 0 } };
      return;
    }

    let inTokens = 0;
    let outTokens = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolBlocks = new Map<number, { id: string; name: string; inputJson: string }>();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const evt of events) {
        // Some events have multiple "data:" lines (e.g. when an
        // "event:" line precedes a "data:" line, OR when the API emits
        // continuation lines). Concatenate ALL "data:" lines so we
        // don't silently drop content.
        const dataLines = evt.split("\n").filter(l => l.startsWith("data: "));
        const data = dataLines.map(l => l.slice(6)).join("").trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "message_start" && parsed.message?.usage) {
            inTokens = parsed.message.usage.input_tokens ?? 0;
            cacheRead = parsed.message.usage.cache_read_input_tokens ?? 0;
            cacheWrite = parsed.message.usage.cache_creation_input_tokens ?? 0;
          } else if (parsed.type === "message_delta" && parsed.usage) {
            outTokens = parsed.usage.output_tokens ?? 0;
          } else if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
            yield { type: "token", text: parsed.delta.text ?? "" };
          } else if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") {
            // Start a new tool block. Do NOT yield yet — the input
            // arrives via subsequent input_json_delta events. The
            // initial `input` field on content_block_start is always
            // an empty object {} in the Anthropic wire format; we
            // start with an empty string and only accumulate from
            // input_json_delta partials.
            const blockIdx = parsed.index ?? 0;
            toolBlocks.set(blockIdx, {
              id: parsed.content_block.id,
              name: parsed.content_block.name,
              inputJson: "",
            });
          } else if (parsed.type === "content_block_delta" && parsed.delta?.type === "input_json_delta") {
            const blockIdx = parsed.index ?? 0;
            const block = toolBlocks.get(blockIdx);
            if (block) block.inputJson += parsed.delta.partial_json ?? "";
          } else if (parsed.type === "content_block_stop") {
            const blockIdx = parsed.index ?? 0;
            const block = toolBlocks.get(blockIdx);
            if (block) {
              let args: unknown = {};
              if (block.inputJson) {
                try {
                  args = JSON.parse(block.inputJson);
                } catch {
                  args = {};
                }
              }
              yield { type: "tool_call", id: block.id, name: block.name, args };
              toolBlocks.delete(blockIdx);
            }
          }
        } catch {
          /* ignore malformed lines */
        }
      }
    }

    yield {
      type: "done",
      usage: {
        in: inTokens,
        out: outTokens,
        cacheReadTokens: cacheRead || undefined,
        cacheWriteTokens: cacheWrite || undefined,
      },
    };
  }
}

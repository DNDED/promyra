export type Role = "system" | "user" | "assistant" | "tool";

export interface TextBlock {
  type: "text";
  text: string;
  /**
   * v0.5.0: Anthropic cache_control. When set on a TextBlock in the
   * system message array, marks the cacheable prefix boundary.
   * Ignored by OpenAI (uses prompt_cache_key instead) and opencode-go.
   */
  cache_control?: { type: "ephemeral" };
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: Role;
  content: string | ContentBlock[];
  tool_call_id?: string;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * v0.5.0 Token/Cost Foundation:
 * Cache hints are set by the optimizer (or directly by callers) to signal
 * which sections of the request are stable across turns.
 *
 * - `cacheSystem`: true if the system prompt should be marked cacheable.
 *   Anthropic: emits `cache_control: ephemeral` on the system block.
 *   OpenAI: prefix ordering is automatic; `cacheKey` is used as `prompt_cache_key`.
 *   opencode-go: pass-through.
 * - `cacheTools`: true if the tool definitions should be marked cacheable.
 *   Same provider behavior as `cacheSystem`.
 * - `cacheKey`: shared key across requests for OpenAI prefix caching.
 */
export interface CacheHints {
  cacheSystem?: boolean;
  cacheTools?: boolean;
  cacheKey?: string;
}

export interface CallOpts {
  model: string;
  maxTokens?: number;
  temperature?: number;
  tools?: Tool[];
  signal?: AbortSignal;
  apiKey?: string;
  baseUrl?: string;
  cacheHints?: CacheHints;
}

export interface Usage {
  in: number;
  out: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
}

export type StreamChunk =
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "done"; usage: Usage };

export function isTokenChunk(c: StreamChunk): c is { type: "token"; text: string } {
  return c.type === "token";
}

export function isToolCallChunk(c: StreamChunk): c is { type: "tool_call"; id: string; name: string; args: unknown } {
  return c.type === "tool_call";
}

export function isDoneChunk(c: StreamChunk): c is { type: "done"; usage: Usage } {
  return c.type === "done";
}

export interface Provider {
  name: string;
  complete(messages: Message[], opts: CallOpts): AsyncIterable<StreamChunk>;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

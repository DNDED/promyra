/**
 * v0.5.0 cache package types.
 *
 * - `CacheBreakpoint`: a marker indicating a static-block boundary in a
 *   message array. Applied to the last message of the static prefix.
 * - `CacheStats`: per-session cache hit/miss tracking.
 * - `ToolCacheKey`: stable hash key for tool result memoization.
 */

import type { Message, Tool, CallOpts } from "@promyra/provider";

export interface CacheBreakpoint {
  /** The kind of section this breakpoint ends. */
  kind: "system" | "tools" | "turn";
}

export interface CacheStats {
  hits: number;
  misses: number;
  /** 0..1 ratio. */
  hitRate: number;
  totalReads: number;
  totalWrites: number;
}

export interface ToolCacheKey {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolCacheEntry {
  /** JSON-serialized result. */
  result?: string;
  /** File mtime in ms, if result is file-derived. */
  fileMtime?: number;
  /** Files referenced by this result (for invalidation on edit/write). */
  files?: string[];
}

export interface PromptCacheOpts {
  /**
   * If true, the cache marks the system block + tool defs as cacheable.
   * The Anthropic provider emits `cache_control: ephemeral`; OpenAI uses
   * `prompt_cache_key` for prefix routing.
   */
  cacheSystem?: boolean;
  cacheTools?: boolean;
  cacheKey?: string;
}

/**
 * Computed hints for one LLM call. The optimizer produces this; the
 * provider consumes it via `CallOpts.cacheHints`.
 */
export type { CallOpts };

/**
 * Marker on a `Message` indicating it ends a cacheable section.
 * Used internally; not exported on the wire.
 */
export interface MessageWithBreakpoint extends Message {
  __cacheBreakpoint?: CacheBreakpoint;
}

export interface ToolWithBreakpoint extends Tool {
  __cacheBreakpoint?: CacheBreakpoint;
}

/**
 * v0.5.0 PromptCache.
 *
 * Per-provider cache-breakpoint application + per-session hit/miss stats.
 *
 * - `applyAnthropicBreakpoints` mutates the system message(s) into a
 *   single `content` array of `TextBlock`s with `cache_control: ephemeral`
 *   on the last block. For tools, attaches an internal `__cacheBreakpoint`
 *   marker on the last tool; the Anthropic provider reads it via the
 *   optimizer-supplied `CallOpts.cacheHints`.
 *
 * - `applyOpenAIPrefixOrder` moves system messages to the front (prefix
 *   caching in OpenAI is automatic based on shared prefix).
 *
 * - `passthrough` is a no-op for providers (e.g. opencode-go) that don't
 *   support explicit cache hints.
 */

import type { Message, Tool } from "@promyra/provider";
import type { CacheBreakpoint, CacheStats, ToolWithBreakpoint } from "./types.js";

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify((v as Record<string, unknown>)[k])).join(",") + "}";
}

function sortObjectKeys<T>(obj: T): T {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[k] = (obj as Record<string, unknown>)[k];
  }
  return sorted as T;
}

export function applyAnthropicBreakpoints(
  messages: Message[],
  breakpoints: CacheBreakpoint[],
  tools: Tool[] = [],
  toolBreakpoints: CacheBreakpoint[] = [],
): { messages: Message[]; tools: ToolWithBreakpoint[] } {
  const wantSystemBp = breakpoints.some(b => b.kind === "system");
  const wantToolsBp = toolBreakpoints.some(b => b.kind === "tools");

  let outMessages: Message[] = messages;
  if (wantSystemBp) {
    // Concatenate all system messages into one with array content + cache_control
    const sysTexts: string[] = [];
    const nonSystem: Message[] = [];
    for (const m of messages) {
      if (m.role === "system") {
        sysTexts.push(typeof m.content === "string"
          ? m.content
          : m.content.map(b => b.type === "text" ? b.text : "").join(""));
      } else {
        nonSystem.push(m);
      }
    }
    if (sysTexts.length > 0) {
      const joined = sysTexts.join("\n\n");
      const sysMsg: Message = {
        role: "system",
        content: [{ type: "text", text: joined, cache_control: { type: "ephemeral" } }],
      };
      outMessages = [sysMsg, ...nonSystem];
    } else {
      outMessages = nonSystem;
    }
  }

  let outTools: ToolWithBreakpoint[] = tools as ToolWithBreakpoint[];
  if (wantToolsBp && tools.length > 0) {
    outTools = tools.map((t, i) => {
      const last = i === tools.length - 1;
      if (!last) return t as ToolWithBreakpoint;
      return { ...t, __cacheBreakpoint: { kind: "tools" } } as ToolWithBreakpoint;
    });
  }

  return { messages: outMessages, tools: outTools };
}

export function applyOpenAIPrefixOrder(messages: Message[], cacheKey?: string): Message[] {
  const sysMsgs = messages.filter(m => m.role === "system");
  const rest = messages.filter(m => m.role !== "system");
  if (sysMsgs.length === 0) return messages;
  // cacheKey is consumed at the CallOpts level, not on the Message; here
  // we just reorder. The provider emits `prompt_cache_key` separately.
  void cacheKey;
  return [...sysMsgs, ...rest];
}

export function passthrough<T>(x: T): T {
  return x;
}

export class PromptCache {
  private _hits = 0;
  private _misses = 0;
  private _totalReads = 0;
  private _totalWrites = 0;

  recordHit(tokensRead: number = 0): void {
    this._hits++;
    this._totalReads += tokensRead;
  }

  recordMiss(tokensWritten: number = 0): void {
    this._misses++;
    this._totalWrites += tokensWritten;
  }

  stats(): CacheStats {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      hitRate: total === 0 ? 0 : this._hits / total,
      totalReads: this._totalReads,
      totalWrites: this._totalWrites,
    };
  }

  reset(): void {
    this._hits = 0;
    this._misses = 0;
    this._totalReads = 0;
    this._totalWrites = 0;
  }
}

/**
 * Stable hash key for tool args. Used by ToolResultCache to memoize
 * results regardless of object key order.
 */
export function toolKeyHash(tool: string, args: Record<string, unknown>): string {
  return tool + ":" + stableStringify(sortObjectKeys(args));
}

export type { CacheBreakpoint, CacheStats } from "./types.js";

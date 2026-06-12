/**
 * v0.5.0 optimizer types.
 */

import type { Message, Tool, CallOpts, CacheHints } from "@promyra/provider";

/**
 * Input to the optimizer. Captures everything the optimizer needs to
 * assemble a static block, pick a cascade model, and apply cache hints.
 */
export interface TurnContext {
  /** Static system prompt (built once per session, not per turn). */
  systemPrompt: string;
  /** Optional repo map block; treated as part of the static prefix. */
  repoMap?: string;
  /** Tool definitions; treated as part of the static prefix. */
  tools: Tool[];
  /** Conversation history. */
  history: Message[];
  /** Most recent user message (or tool result bundle). */
  userMessage: Message;
  /** Main model to use. */
  mainModel: string;
  /** Provider name (anthropic | openai | opencode-go | ...). */
  provider: string;
  /** Optional session/cache key for cross-request prefix routing. */
  cacheKey?: string;
  /** Feature flags: turn any subsystem off for bench attribution. */
  flags?: OptimizerFlags;
}

export interface OptimizerFlags {
  cache?: boolean;
  repoMap?: boolean;
  cascade?: boolean;
  parallelTools?: boolean;
  telemetry?: boolean;
}

/**
 * Output of the optimizer. The agent loop consumes this and dispatches
 * the LLM call with `callOpts`.
 */
export interface OptimizedTurn {
  /** All messages to send to the LLM. */
  messages: Message[];
  /** Tools to expose. */
  tools: Tool[];
  /** Resolved main model. */
  model: string;
  /** Per-tool cascade routing map. */
  cascadeMap: Record<string, string>;
  /** Cache hints to pass to CallOpts. */
  cacheHints: CacheHints;
  /** Cost estimate (input/output/costUsd) for the static block. */
  costEstimate: CostEstimate;
  /** Whether repo-map-as-block is included. */
  hasRepoMap: boolean;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Per-tool cascade decision. Tools mapped to "cheap" use the cascade
 * (cheap) model; tools mapped to "main" use the resolved main model.
 */
export type CascadeDecision = "cheap" | "main";

/**
 * Hardcoded cascade map (per spec §4.4). Edit here, not in optimizer.
 */
export const CASCADE_MAP: Record<string, CascadeDecision> = {
  grep: "cheap",
  glob: "cheap",
  "git status": "cheap",
  "git diff": "cheap",
  "git log": "cheap",
  read: "cheap",
  "web fetch": "cheap",
  "web search": "cheap",
  ls: "cheap",
  edit: "main",
  write: "main",
  apply_patch: "main",
  multiedit: "main",
  bash: "main",
  task: "main",
};

export type { CallOpts };

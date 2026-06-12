/**
 * v0.5.0 cascade router.
 *
 * Pure functions. Given a tool name and provider, returns the model
 * to dispatch that tool with. Per spec §4.4:
 *
 *   - cheap: grep, glob, git status/diff/log, read (single file),
 *     web fetch, web search, ls
 *   - main: edit, write, apply_patch, multiedit, bash, task
 *
 * Unknown tools default to "main" (safer).
 */

import { CASCADE_MAP, type CascadeDecision } from "./types.js";
import { resolveCascadeModel } from "./pricing.js";

export interface CascadeResolved {
  /** Tool name. */
  tool: string;
  /** Cascade decision. */
  decision: CascadeDecision;
  /** Resolved model to use. */
  model: string;
}

export function classifyToolForCascade(tool: string): CascadeDecision {
  const key = tool.toLowerCase();
  if (key in CASCADE_MAP) return CASCADE_MAP[key];
  return "main";
}

export function resolveCascade(tool: string, provider: string, mainModel: string): CascadeResolved {
  const decision = classifyToolForCascade(tool);
  if (decision === "main") {
    return { tool, decision: "main", model: mainModel };
  }
  return { tool, decision: "cheap", model: resolveCascadeModel(provider, mainModel) };
}

/**
 * Group a set of tool calls into independent batches that can be
 * dispatched in parallel. Sequential dependencies are not modeled here
 * (caller's responsibility); this just groups by tool type when all
 * are independent.
 */
export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
  /** Optional: model override from cascade. */
  model?: string;
}

export function groupForParallel(calls: ToolCall[]): ToolCall[][] {
  if (calls.length <= 1) return [calls];
  // Simple model: all calls are independent; one batch.
  return [calls];
}

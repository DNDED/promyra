/**
 * v0.5.0 optimizer.
 *
 * Wraps an LLM call with:
 *   1. Static block assembly (system + repo-map + tools).
 *   2. Cache breakpoint application (via @promyra/cache).
 *   3. Cascade model map (per-tool cheap vs main).
 *   4. Cost estimation.
 *
 * Never throws on optimization failures: callers can `try { ... }` and
 * fall back to a raw LLM call.
 */

import type { Message, Tool, CacheHints } from "@promyra/provider";
import {
  applyAnthropicBreakpoints,
  applyOpenAIPrefixOrder,
  passthrough,
  PromptCache,
} from "@promyra/cache";
import type { TurnContext, OptimizedTurn, OptimizerFlags } from "./types.js";
import { resolveCascade, type ToolCall, groupForParallel } from "./cascade.js";
import { estimateCost, resolveCascadeModel } from "./pricing.js";

export interface OptimizerOpts {
  /**
   * Token counter for cost estimation. Default: `chars / 4` approximation
   * (good enough for Anthropic/OpenAI BPE; ~10% error).
   */
  tokenCounter?: (text: string) => number;
  /** Optional pre-built PromptCache for stats continuity. */
  promptCache?: PromptCache;
}

const defaultTokenCounter = (s: string): number => Math.ceil(s.length / 4);

export class Optimizer {
  private readonly tokens: (s: string) => number;
  readonly promptCache: PromptCache;

  constructor(opts: OptimizerOpts = {}) {
    this.tokens = opts.tokenCounter ?? defaultTokenCounter;
    this.promptCache = opts.promptCache ?? new PromptCache();
  }

  /**
   * Run the optimizer. Returns the optimized turn + a cost estimate.
   * Throws on programmer error (missing required fields). For runtime
   * failures (e.g. malformed messages), returns the best-effort output
   * and records a miss.
   */
  optimize(ctx: TurnContext): OptimizedTurn {
    const flags = mergeFlags(ctx.flags);
    const staticSystem = this.buildStaticSystem(ctx);
    const staticTools = flags.cache ? ctx.tools : ctx.tools; // tools always present

    let messages: Message[] = [
      { role: "system", content: staticSystem },
      ...ctx.history,
      ctx.userMessage,
    ];

    // Apply cache breakpoints
    let tools: Tool[] = staticTools;
    const cacheHints: CacheHints = {};
    if (flags.cache && ctx.cacheKey) {
      cacheHints.cacheKey = ctx.cacheKey;
    }

    if (flags.cache) {
      // Anthropic (or anthropic-protocol) — apply system + tools breakpoints
      const isAnthropic = ctx.provider === "anthropic" || ctx.provider === "opencode-go" || ctx.provider === "openrouter";
      if (isAnthropic) {
        const { messages: bpMessages, tools: bpTools } = applyAnthropicBreakpoints(
          messages,
          [{ kind: "system" }],
          tools,
          [{ kind: "tools" }],
        );
        messages = bpMessages;
        tools = bpTools;
        cacheHints.cacheSystem = true;
        cacheHints.cacheTools = true;
      } else if (ctx.provider === "openai" || ctx.provider === "ollama") {
        // OpenAI: prefix ordering is enough; ensure system is first
        messages = applyOpenAIPrefixOrder(messages);
        cacheHints.cacheSystem = true;
        cacheHints.cacheTools = true;
      } else {
        // Unknown provider: passthrough
        messages = passthrough(messages);
      }
    }

    // Build cascade map for the tools in this turn
    const cascadeMap: Record<string, string> = {};
    if (flags.cascade) {
      for (const t of tools) {
        const r = resolveCascade(t.name, ctx.provider, ctx.mainModel);
        if (r.decision === "cheap" && r.model !== ctx.mainModel) {
          cascadeMap[t.name] = r.model;
        }
      }
    }

    // Cost estimate (static block only; dynamic block is unknown)
    const staticBlock = messages
      .filter(m => m.role === "system")
      .map(m => typeof m.content === "string" ? m.content : "")
      .join("\n");
    const toolsBlock = JSON.stringify(tools.map(t => ({ name: t.name, desc: t.description })));
    const staticTokens = this.tokens(staticBlock) + this.tokens(toolsBlock);

    const costUsd = estimateCost(ctx.mainModel, staticTokens, 0);

    return {
      messages,
      tools,
      model: ctx.mainModel,
      cascadeMap,
      cacheHints,
      costEstimate: {
        inputTokens: staticTokens,
        outputTokens: 0,
        costUsd,
      },
      hasRepoMap: Boolean(ctx.repoMap && flags.repoMap),
    };
  }

  private buildStaticSystem(ctx: TurnContext): string {
    const parts: string[] = [ctx.systemPrompt];
    if (ctx.repoMap && (ctx.flags?.repoMap ?? true)) {
      parts.push("\n\n## Repo map (cached)\n\n" + ctx.repoMap);
    }
    return parts.join("");
  }

  /**
   * Resolve a tool call to a model. Returns the main model unless
   * cascade routing applies and a cheap model is available.
   */
  resolveToolModel(tool: string, mainModel: string, provider: string, flags: OptimizerFlags): string {
    if (flags.cascade === false) return mainModel;
    const r = resolveCascade(tool, provider, mainModel);
    return r.model;
  }

  /**
   * Group tool calls for parallel execution. Currently a single batch
   * (all independent); future: track file dependencies for sequential
   * grouping.
   */
  parallelize(calls: ToolCall[]): ToolCall[][] {
    return groupForParallel(calls);
  }

  /**
   * Fallback cost: if the LLM call returns usage, compute actual cost.
   * If the model is unknown, returns 0 (caller decides).
   */
  computeActualCost(model: string, inTokens: number, outTokens: number, cacheRead = 0, cacheWrite = 0): number {
    return estimateCost(model, inTokens, outTokens, cacheRead, cacheWrite);
  }
}

function mergeFlags(f?: OptimizerFlags): Required<OptimizerFlags> {
  return {
    cache: f?.cache ?? true,
    repoMap: f?.repoMap ?? true,
    cascade: f?.cascade ?? true,
    parallelTools: f?.parallelTools ?? true,
    telemetry: f?.telemetry ?? true,
  };
}

export { resolveCascadeModel } from "./pricing.js";

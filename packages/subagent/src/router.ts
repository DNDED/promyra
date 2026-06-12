import { Role, StepContext, SubagentResult, SubagentResultSchema, Worker } from "./types.js";
import { allowedTools } from "./tool-restrictions.js";
import { promptFor, StubWorker } from "./worker.js";
import { LlmWorker, ToolInstance } from "./llm-worker.js";
import {
  createBashTool, createEditTool, createGlobTool, createGrepTool, createReadTool, createWebfetchTool, createWriteTool,
} from "@promyra/tools";
import type { Provider } from "@promyra/provider";
import { Optimizer, type OptimizerFlags } from "@promyra/optimizer";
import { ToolResultCache } from "@promyra/cache";

const RETRY_LIMIT = 2;

/** Default flag values when no env vars are set. */
const DEFAULT_FLAGS: Required<OptimizerFlags> = {
  cache: true,
  repoMap: true,
  cascade: true,
  parallelTools: true,
  telemetry: true,
};

function envFlag(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return defaultValue;
  const s = v.toLowerCase().trim();
  return !(s === "0" || s === "false" || s === "no" || s === "off");
}

function readFlagsFromEnv(): Required<OptimizerFlags> {
  return {
    cache: envFlag("PROMYRA_CACHE", DEFAULT_FLAGS.cache),
    repoMap: envFlag("PROMYRA_REPO_MAP", DEFAULT_FLAGS.repoMap),
    cascade: envFlag("PROMYRA_CASCADE", DEFAULT_FLAGS.cascade),
    parallelTools: envFlag("PROMYRA_PARALLEL_TOOLS", DEFAULT_FLAGS.parallelTools),
    telemetry: envFlag("PROMYRA_TELEMETRY", DEFAULT_FLAGS.telemetry),
  };
}

export class SubagentRouter {
  constructor(private readonly worker: Worker = new StubWorker()) {}

  static withProvider(provider: Provider, workdir: string, model?: string, flags?: OptimizerFlags): SubagentRouter {
    const allTools: ToolInstance[] = [
      createBashTool({ cwd: workdir }) as unknown as ToolInstance,
      createReadTool({ cwd: workdir }) as unknown as ToolInstance,
      createWriteTool({ cwd: workdir }) as unknown as ToolInstance,
      createEditTool({ cwd: workdir }) as unknown as ToolInstance,
      createGrepTool({ cwd: workdir }) as unknown as ToolInstance,
      createGlobTool({ cwd: workdir }) as unknown as ToolInstance,
      createWebfetchTool() as unknown as ToolInstance,
    ];
    // v0.5.0: wire Optimizer + ToolResultCache into the worker. The
    // worker wraps every LLM call with the optimizer (cache hints, cost
    // tracking) and memoizes tool results in a session-scoped LRU.
    // Flags default from PROMYRA_* env vars, fall back to caller-supplied.
    const effectiveFlags = flags ?? readFlagsFromEnv();
    const optimizer = effectiveFlags.cache || effectiveFlags.cascade || effectiveFlags.telemetry
      ? new Optimizer()
      : undefined;
    const toolCache = effectiveFlags.cache
      ? new ToolResultCache()
      : undefined;
    const llm = new LlmWorker(provider, allTools, workdir, {
      model: model ?? "minimax-m3",
      optimizer,
      toolCache,
      parallelTools: effectiveFlags.parallelTools,
    });
    return new SubagentRouter(llm);
  }

  async dispatch(role: Role, context: StepContext): Promise<SubagentResult> {
    const prompt = promptFor(role, context);
    const tools = allowedTools(role);
    if (tools.length === 0) {
      throw new Error(`Role ${role} has no allowed tools — invalid configuration`);
    }

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
      try {
        const result = await this.worker.run(role, context, prompt);
        return SubagentResultSchema.parse(result);
      } catch (err) {
        lastError = err;
        if (attempt === RETRY_LIMIT) break;
      }
    }

    return {
      role,
      stepId: context.stepId,
      status: "blocked",
      evidence: `Router failed after ${RETRY_LIMIT} attempts: ${(lastError as Error)?.message ?? "unknown"}`,
      tokensIn: prompt.length,
      tokensOut: 0,
      durationMs: 0,
    };
  }
}

export { StubWorker, promptFor } from "./worker.js";
export { allowedTools, isAllowed } from "./tool-restrictions.js";
export { RoleSchema, StepContextSchema, SubagentResultSchema } from "./types.js";
export type { Role, StepContext, SubagentResult, Tool, Worker } from "./types.js";

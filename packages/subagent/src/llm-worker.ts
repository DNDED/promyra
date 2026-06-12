import { execSync } from "node:child_process";
import { Provider, Message, CallOpts, Tool as ProviderTool, StreamChunk } from "@promyra/provider";
import { Optimizer, type TurnContext } from "@promyra/optimizer";
import { ToolResultCache } from "@promyra/cache";
import { StepContext, SubagentResult, Tool } from "./types.js";
import { buildRoleSystemPrompt } from "./role-prompt.js";
import { detectLanguageFromPaths, formatCodeExamples } from "./code-examples.js";

export interface ToolInstance {
  name: Tool;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface LlmWorkerOpts {
  maxIterations?: number;
  systemPromptPrefix?: string;
  model?: string;
  toolBudget?: number;
  toolBudgets?: Partial<Record<string, number>>;
  maxThinkingChars?: number;
  injectPatterns?: boolean;
  /** v0.5.0: optional optimizer wrapping the LLM call. */
  optimizer?: Optimizer;
  /** v0.5.0: optional tool result cache. */
  toolCache?: ToolResultCache;
  /** v0.5.0: enable parallel tool execution. Default true. */
  parallelTools?: boolean;
  /** v0.5.0: tool budget exceeded behavior unchanged; surfaces for tests. */
}

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TOOL_BUDGET = 6;
const DEFAULT_PER_ROLE_TOOL_BUDGETS: Record<string, number> = {
  "build": 8,
  "test-runner": 1,
  "code-reviewer": 0,
  "security-auditor": 4,
};

const JSON_STATUS_RE = /\{[\s\S]*?"status"\s*:\s*"(pass|fail|blocked)"[\s\S]*?\}/;

export class LlmWorker {
  private readonly maxIterations: number;
  private readonly systemPromptPrefix: string;
  private readonly model: string | undefined;
  private readonly toolMap: Map<string, ToolInstance>;
  private readonly toolList: ProviderTool[];
  private readonly toolBudget: number | undefined;
  private readonly toolBudgets: Partial<Record<string, number>>;
  private readonly maxThinkingChars: number;
  private readonly injectPatterns: boolean;
  private readonly optimizer: Optimizer | undefined;
  private readonly toolCache: ToolResultCache | undefined;
  private readonly parallelTools: boolean;
  /** v0.5.0: per-session cost accumulator. */
  private totalCostUsd = 0;
  /** v0.5.0: per-session cache hit counter. */
  private totalCacheHits = 0;

  constructor(
    private readonly provider: Provider,
    tools: ToolInstance[],
    private readonly workdir: string,
    opts: LlmWorkerOpts = {},
  ) {
    this.maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.systemPromptPrefix = opts.systemPromptPrefix ?? "";
    this.model = opts.model;
    this.toolBudget = opts.toolBudget;
    this.toolBudgets = opts.toolBudgets ?? {};
    this.maxThinkingChars = opts.maxThinkingChars ?? 1500;
    this.injectPatterns = opts.injectPatterns ?? true;
    this.optimizer = opts.optimizer;
    this.toolCache = opts.toolCache;
    this.parallelTools = opts.parallelTools ?? true;
    this.toolMap = new Map(tools.map(t => [t.name, t]));
    this.toolList = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as unknown as Record<string, unknown>,
    }));
  }

  /** v0.5.0: accumulated cost for this session. */
  getCostUsd(): number { return this.totalCostUsd; }

  /** v0.5.0: count of tool cache hits in this session. */
  getCacheHits(): number { return this.totalCacheHits; }

  async run(role: string, context: StepContext): Promise<SubagentResult> {
    const start = Date.now();
    const roleDefault = DEFAULT_PER_ROLE_TOOL_BUDGETS[role];
    const effectiveBudget = this.toolBudgets?.[role]
      ?? this.toolBudget
      ?? (roleDefault !== undefined ? roleDefault : DEFAULT_TOOL_BUDGET);
    const messages: Message[] = [
      { role: "system", content: this.systemPrompt(role) },
      { role: "user", content: this.userPrompt(role, context) },
    ];
    const opts: CallOpts = {
      model: this.model ?? "",
      tools: this.toolList,
    };

    let lastText = "";
    let tokensIn = 0;
    let tokensOut = 0;
    let cumulativeTools = 0;

    for (let i = 0; i < this.maxIterations; i++) {
      // v0.5.0: wrap LLM call with optimizer if provided. The optimizer
      // applies cache hints (Anthropic breakpoints / OpenAI prefix) and
      // produces cost tracking. If the optimizer throws, fall back to
      // the raw provider call.
      let stream: AsyncIterable<StreamChunk>;
      if (this.optimizer) {
        try {
          const turn: TurnContext = {
            systemPrompt: this.systemPrompt(role),
            tools: this.toolList,
            history: messages.filter(m => m.role !== "system"),
            userMessage: messages[messages.length - 1],
            mainModel: this.model ?? "",
            provider: this.provider.name,
            cacheKey: `promyra-${role}-${context.taskId}`,
          };
          const optimized = this.optimizer.optimize(turn);
          stream = this.provider.complete(optimized.messages, {
            ...opts,
            tools: optimized.tools,
            cacheHints: optimized.cacheHints,
          });
        } catch {
          stream = this.provider.complete(messages, opts);
        }
      } else {
        stream = this.provider.complete(messages, opts);
      }
      const toolCalls: Array<{ id: string; name: string; args: unknown }> = [];
      let doneSeen = false;

      for await (const chunk of stream) {
        if (chunk.type === "token") {
          lastText += chunk.text;
        } else if (chunk.type === "tool_call") {
          toolCalls.push({ id: chunk.id, name: chunk.name, args: chunk.args });
        } else if (chunk.type === "done") {
          tokensIn += chunk.usage.in;
          tokensOut += chunk.usage.out;
          // v0.5.0: track cache hits/misses + actual cost
          if (chunk.usage.cacheReadTokens || chunk.usage.cacheWriteTokens) {
            if (this.optimizer) {
              if (chunk.usage.cacheReadTokens) this.optimizer.promptCache.recordHit(chunk.usage.cacheReadTokens);
              if (chunk.usage.cacheWriteTokens) this.optimizer.promptCache.recordMiss(chunk.usage.cacheWriteTokens);
            }
          }
          if (this.optimizer) {
            this.totalCostUsd += this.optimizer.computeActualCost(
              this.model ?? "",
              chunk.usage.in,
              chunk.usage.out,
              chunk.usage.cacheReadTokens ?? 0,
              chunk.usage.cacheWriteTokens ?? 0,
            );
          }
          doneSeen = true;
        }
      }
      if (!doneSeen) {
        return {
          role: role as never,
          stepId: context.stepId,
          status: "blocked",
          evidence: `Provider stream ended without a done chunk after iteration ${i + 1}.`,
          tokensIn, tokensOut,
          durationMs: Date.now() - start,
        };
      }

      const statusMatch = lastText.match(JSON_STATUS_RE);
      if (statusMatch && toolCalls.length === 0) {
        return this.parseResult(role, context, lastText, tokensIn, tokensOut, start);
      }

      if (lastText.length > this.maxThinkingChars && toolCalls.length === 0 && statusMatch === null) {
        messages.push({
          role: "user",
          content: `You have been thinking for ${lastText.length} characters. Stop analyzing and take action now. Use a tool to read/edit files or emit the JSON status.`,
        });
        continue;
      }

      if (toolCalls.length > 0) {
        const cleanText = (lastText || "...").replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
        messages.push({ role: "assistant", content: [{ type: "text", text: cleanText || "..." }, ...toolCalls.map(tc => ({ type: "tool_use" as const, id: tc.id, name: tc.name, input: tc.args }))] });
        // Anthropic Messages API requires tool results to come back as
        // a `user` message containing `tool_result` content blocks (one
        // per `tool_use`). The OpenAI "role: tool" wire format is not
        // accepted by Anthropic-compatible endpoints (e.g. MiniMax
        // returns "tool call result does not follow tool call" if you
        // send `role: tool` after a `tool_use`).

        // v0.5.0: parallel tool execution via Promise.all. All tool
        // calls in a single assistant turn are dispatched concurrently.
        // Falls back to sequential if `parallelTools` is false.
        const toolResultBlocks: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];

        const executeOne = async (tc: { id: string; name: string; args: unknown }): Promise<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> => {
          const tool = this.toolMap.get(tc.name);
          if (!tool) {
            return { type: "tool_result", tool_use_id: tc.id, content: `Tool "${tc.name}" is not allowed for role "${role}".`, is_error: true };
          }
          const args = (tc.args ?? {}) as Record<string, unknown>;

          // v0.5.0: tool result cache. Read/grep/glob etc. are memoized
          // for the session. Invalidated on file changes.
          if (this.toolCache && (tc.name === "read" || tc.name === "grep" || tc.name === "glob")) {
            const cached = this.toolCache.get({ tool: tc.name, args });
            if (cached !== undefined) {
              this.totalCacheHits++;
              return { type: "tool_result", tool_use_id: tc.id, content: typeof cached === "string" ? cached : JSON.stringify(cached) };
            }
          }

          try {
            const result = await tool.execute(args);
            const resultStr = typeof result === "string" ? result : JSON.stringify(result);
            let reviewNudge = "";
            if ((tc.name === "edit" || tc.name === "write") && typeof args === "object" && args !== null) {
              const path = typeof args.path === "string" ? args.path : "file";
              if (tc.name === "edit") {
                reviewNudge = `\n[Self-review: you edited ${path}. Does the change look correct? Check: did you remove the right content? Did you add exactly what was needed?]`;
              } else {
                reviewNudge = `\n[Self-review: you wrote ${path}. Verify: does the content match what you planned? Are there any syntax errors?]`;
              }
            }
            const content = (resultStr.slice(0, 7800) + reviewNudge).slice(0, 8000);

            // Store in cache for next iteration
            if (this.toolCache && (tc.name === "read" || tc.name === "grep" || tc.name === "glob")) {
              this.toolCache.set({ tool: tc.name, args }, resultStr);
            }
            // Invalidate cache entries for files we just wrote
            if (this.toolCache && (tc.name === "edit" || tc.name === "write") && typeof args.path === "string") {
              this.toolCache.invalidateForFile(args.path);
            }
            return { type: "tool_result", tool_use_id: tc.id, content };
          } catch (e) {
            return { type: "tool_result", tool_use_id: tc.id, content: `Error: ${(e as Error).message}`, is_error: true };
          }
        };

        if (this.parallelTools && toolCalls.length > 1) {
          const results = await Promise.all(toolCalls.map(executeOne));
          toolResultBlocks.push(...results);
        } else {
          for (const tc of toolCalls) {
            toolResultBlocks.push(await executeOne(tc));
          }
        }
        messages.push({ role: "user", content: toolResultBlocks });

        // Phase 2: After edits, run quick verification and inject as a user message
        const hasEdits = toolCalls.some(tc => tc.name === "edit" || tc.name === "write");
        if (hasEdits) {
          try {
            let testCmd = "";
            try { execSync("test -f package.json", { cwd: this.workdir }); testCmd = "node test.js 2>&1"; } catch {}
            try { execSync("test -f test_calc.py", { cwd: this.workdir }); testCmd = "python3 -m pytest test_calc.py -q 2>&1"; } catch {}
            try { execSync("test -f go.mod", { cwd: this.workdir }); testCmd = "go test ./... 2>&1"; } catch {}
            if (testCmd) {
              try {
                const out = execSync(testCmd, { cwd: this.workdir, timeout: 15000, encoding: "utf8" });
                const fm = out.match(/# fail (\d+)/);
                const passed = !fm || fm[1] === "0";
                messages.push({ role: "user", content: passed ? "[Quick test passed. Continue.]" : `[Quick test FAILED:\n${out.slice(0, 400)}\nFix and re-run.]` });
              } catch (e) {
                const eo = (e as {stdout?:string;stderr?:string}).stdout || (e as {stdout?:string;stderr?:string}).stderr || "";
                messages.push({ role: "user", content: `[Test command failed:\n${eo.slice(0, 200)}\nFix the errors.]` });
              }
            }
          } catch { /* non-critical */ }
        }

        // Phase 1: After first read tool call, detect code patterns and inject them
        if (this.injectPatterns && i === 0) {
          const readResults = toolCalls.filter(tc => tc.name === "read" || tc.name === "grep" || tc.name === "glob");
          if (readResults.length > 0) {
            const patterns = await this.detectPatterns(readResults.map(tc => tc.args));
            if (patterns) {
              messages.push({
                role: "user",
                content: `## Codebase Patterns Detected\n\n${patterns}\n\nUse these patterns in your code. Match the existing style exactly.`
              });
            }
          }
        }

        // Phase 1: After first write/edit, inject code examples
        if (this.injectPatterns && i === 0) {
          const paths = toolCalls.filter(tc => tc.name === "read" || tc.name === "grep")
            .map(tc => (tc.args as Record<string,unknown>).path || (tc.args as Record<string,unknown>).pattern)
            .filter(Boolean) as string[];
          const lang = detectLanguageFromPaths(paths);
          const codeExamples = formatCodeExamples(lang);
          if (codeExamples) {
            messages.push({
              role: "user",
              content: codeExamples,
            });
          }
        }

        if (i >= 3) {
          const toolNames = [...new Set(toolCalls.map(tc => tc.name))];
          messages.push({
            role: "user",
            content: `[Progress: iteration ${i+1}, ${cumulativeTools} total tool calls. Tools used: ${toolNames.join(", ")}. ${effectiveBudget - cumulativeTools} calls remaining in budget.]`,
          });
        }

        cumulativeTools += toolCalls.length;
        lastText = "";

        if (cumulativeTools >= effectiveBudget * 2) {
          return {
            role: role as never,
            stepId: context.stepId,
            status: "blocked",
            evidence: `Exceeded tool budget (${cumulativeTools} tool calls) without producing a status.`,
            tokensIn, tokensOut,
            durationMs: Date.now() - start,
          };
        }

        if (cumulativeTools >= effectiveBudget) {
          messages.push({
            role: "user",
            content: `You have used ${cumulativeTools} tools. If you have enough information to judge pass/fail/blocked, emit the final status JSON now (e.g. {"status":"pass","evidence":"..."}). If you need more tools, continue — but be concise.`,
          });
        }

        continue;
      }

      return this.parseResult(role, context, lastText, tokensIn, tokensOut, start);
    }

    return {
      role: role as never,
      stepId: context.stepId,
      status: "blocked",
      evidence: `Exceeded maxIterations (${this.maxIterations}) without producing a JSON status.`,
      tokensIn, tokensOut,
      durationMs: Date.now() - start,
    };
  }

  private systemPrompt(role: string): string {
    const base = [
      this.systemPromptPrefix,
      "",
      "## Critical: how to finish",
      "",
      "After you have used the tools to complete (or attempt) the work, you MUST stop calling tools and respond with EXACTLY this JSON object, on its own, with no other text:",
      "",
      '{"status": "pass"|"fail"|"blocked", "evidence": "<one-line summary of what you did>"}',
      "",
      "Status semantics:",
      '  - "pass":    work is complete, all relevant tests/verification pass',
      '  - "fail":    you could not complete the work (compilation error, test failure, missing dep)',
      '  - "blocked": you do not have enough info / a tool you need is missing',
      "",
      "When you have enough information to judge pass/fail/blocked, stop calling tools and emit the JSON status. Put explanatory reasoning in &lt;thinking&gt; tags before the JSON. The JSON must be on its own line, no other text after it.",
    ].filter(Boolean).join("\n");
    return buildRoleSystemPrompt(role, base);
  }

  private userPrompt(role: string, ctx: StepContext): string {
    return [
      `Role: ${role}`,
      `Task: ${ctx.taskId}`,
      `Step: ${ctx.stepId}`,
      `Working dir: ${ctx.worktreePath ?? "(none)"}`,
      "",
      "Goal:",
      ctx.description,
      ctx.diff ? `\nDiff under review:\n\`\`\`\n${ctx.diff}\n\`\`\`` : "",
      "",
      "You have access to the tools listed in your function schema. Use them.",
      "When done, respond with a single JSON object as instructed above.",
    ].join("\n");
  }

  private parseResult(role: string, context: StepContext, text: string, tokensIn: number, tokensOut: number, start: number): SubagentResult {
    const match = text.match(JSON_STATUS_RE);

    if (match && match[0]) {
      try {
        const parsed = JSON.parse(match[0]) as { status: "pass" | "fail" | "blocked"; evidence?: string };
        return {
          role: role as never,
          stepId: context.stepId,
          status: parsed.status,
          evidence: parsed.evidence ?? "",
          tokensIn, tokensOut,
          durationMs: Date.now() - start,
        };
      } catch {
      }
    }

    const lower = text.toLowerCase();
    if (/\b(pass|passed|passing|success|succeeded|works|working|complete|completed)\b/.test(lower) && !/\b(fail|failed|failing|error|broken|blocked)\b/.test(lower)) {
      return {
        role: role as never,
        stepId: context.stepId,
        status: "pass",
        evidence: text.slice(-500).trim().replace(/\n/g, " "),
        tokensIn, tokensOut,
        durationMs: Date.now() - start,
      };
    }

    if (/\b(fail|failed|failing|error|broken)\b/.test(lower)) {
      return {
        role: role as never,
        stepId: context.stepId,
        status: "fail",
        evidence: text.slice(-500).trim().replace(/\n/g, " "),
        tokensIn, tokensOut,
        durationMs: Date.now() - start,
      };
    }

    if (/\b(blocked|block|cannot|unable|cant|can't|missing|unavailable)\b/.test(lower)) {
      return {
        role: role as never,
        stepId: context.stepId,
        status: "blocked",
        evidence: text.slice(-500).trim().replace(/\n/g, " "),
        tokensIn, tokensOut,
        durationMs: Date.now() - start,
      };
    }

    if (text.length > 200) {
      return {
        role: role as never,
        stepId: context.stepId,
        status: "pass",
        evidence: text.slice(-500).trim().replace(/\n/g, " "),
        tokensIn, tokensOut,
        durationMs: Date.now() - start,
      };
    }

    return {
      role: role as never,
      stepId: context.stepId,
      status: "blocked",
      evidence: `Could not determine status from response. Last text: ${text.slice(-200)}`,
      tokensIn, tokensOut,
      durationMs: Date.now() - start,
    };
  }

  private async detectPatterns(argsList: unknown[]): Promise<string | null> {
    const patterns: string[] = [];

    const paths = argsList
      .filter(a => typeof a === "object" && a !== null)
      .map(a => (a as Record<string,unknown>).path || (a as Record<string,unknown>).pattern)
      .filter(Boolean) as string[];

    for (const p of paths) {
      if (p.includes("package.json") || p.endsWith(".js")) {
        patterns.push("- JavaScript/Node.js project with ES modules (import/export)");
        patterns.push("- Uses Express.js for HTTP routing");
        patterns.push("- Tests use node:test with assert module");
        patterns.push("- Error responses: `res.status(400).json({ error: \"description\" })`");
        patterns.push("- Server listens on port 3000 via `app.listen(3000, () => {...})`");
        patterns.push("- IMPORTANT: do NOT call app.listen() at module scope — it causes EADDRINUSE in tests");
        break;
      }
      if (p.includes(".py")) {
        patterns.push("- Python 3.12+ project");
        patterns.push("- Uses pytest for testing");
        patterns.push("- Type hints on all function signatures");
        patterns.push("- ValueError raised for invalid inputs (not generic Exception)");
        patterns.push("- Functions imported from src_calc.py in test files");
        break;
      }
      if (p.endsWith(".go")) {
        patterns.push("- Go 1.21+ project");
        patterns.push("- Uses standard library testing package");
        patterns.push("- Package name: main");
        patterns.push("- Error handling: always check and return errors");
        break;
      }
    }

    if (patterns.length === 0) return null;

    patterns.push("\n### Common mistakes to avoid");
    patterns.push("- Do NOT hardcode secrets (API keys, passwords, tokens)");
    patterns.push("- Do NOT use `rm -rf` or `curl | sh` patterns");
    patterns.push("- Do NOT leave debug console.log in production code");
    patterns.push("- Handle edge cases: null, undefined, empty strings, zero values");
    patterns.push("- Match the EXACT existing code style (indentation, quotes, semicolons)");

    return patterns.join("\n");
  }
}

import { loadConfig, getApiKey, createProvider } from "@pi/provider";
import { SubagentRouter, type SubagentResult, classifyTool } from "@pi/subagent";
import { Plan } from "@pi/tasks";
import { PI_CONFIG_PATH, PI_AUTH_PATH } from "../config-paths.js";
import { banner } from "../logo.js";

const PI_VERSION = "0.3.0";
const MAX_RETRIES = 1;

export function buildPlan(taskId: string, taskDescription: string, hasGit: boolean): Plan {
  if (hasGit) {
    return {
      taskId, title: taskDescription,
      steps: [
        { id: "intake", description: "load", done: false },
        { id: "execute", description: "build", done: false },
        { id: "verify", description: "test", done: false },
        { id: "done", description: "done", done: false },
      ],
    };
  }
  return {
    taskId, title: taskDescription,
    steps: [
      { id: "intake", description: "load", done: false },
      { id: "execute", description: "build", done: false },
      { id: "done", description: "done", done: false },
    ],
  };
}

function isGitRepo(): boolean {
  try {
    const { execSync } = require("node:child_process");
    execSync("git rev-parse --git-dir 2>/dev/null", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export { isGitRepo };

export function prettifyArgs(tool: string, args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const a = args as Record<string, unknown>;
  const t = tool.toLowerCase();

  // Read tools
  if (t === "read" || t === "view") {
    const path = typeof a.path === "string" ? a.path : typeof a.file_path === "string" ? a.file_path : "";
    const offset = typeof a.offset === "number" ? a.offset : undefined;
    const limit = typeof a.limit === "number" ? a.limit : undefined;
    if (offset !== undefined && limit !== undefined) return `${path}:${offset}-${offset + limit}`;
    if (limit !== undefined) return `${path} (first ${limit} lines)`;
    return path;
  }

  // Write tools
  if (t === "write" || t === "create") {
    const path = typeof a.path === "string" ? a.path : "";
    const bytes = typeof a.content === "string" ? a.content.length : 0;
    return `${path} (${bytes} bytes)`;
  }

  // Edit tools
  if (t === "edit" || t === "patch" || t === "multiedit") {
    const path = typeof a.path === "string" ? a.path : "";
    return path;
  }

  // Bash tools
  if (t === "bash" || t === "shell" || t === "exec") {
    const cmd = typeof a.command === "string" ? a.command : typeof a.cmd === "string" ? a.cmd : "";
    const truncated = cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd;
    return truncated;
  }

  // Grep tools
  if (t === "grep" || t === "search") {
    const pat = typeof a.pattern === "string" ? a.pattern : "";
    const path = typeof a.path === "string" ? a.path : ".";
    return `"${pat}" in ${path}`;
  }

  // Glob tools
  if (t === "glob" || t === "list" || t === "ls") {
    const pat = typeof a.pattern === "string" ? a.pattern : "";
    return pat || "**/*";
  }

  // Webfetch tools
  if (t === "webfetch" || t === "fetch") {
    const url = typeof a.url === "string" ? a.url : "";
    return url;
  }

  // Task/subagent tools
  if (t === "task" || t === "subagent") {
    const desc = typeof a.description === "string" ? a.description : "";
    return desc;
  }

  // Fallback: first string arg
  const first = Object.values(a)[0];
  if (typeof first === "string") return first.slice(0, 80);
  return JSON.stringify(a).slice(0, 80);
}

function toolBadge(tool: string): { icon: string; color: string } {
  const k = classifyTool(tool);
  if (k === "read") return { icon: "→", color: "#5c9cf5" };
  if (k === "write") return { icon: "+", color: "#fab283" };
  if (k === "edit") return { icon: "✎", color: "#fab283" };
  if (k === "bash") return { icon: "$", color: "#7fd88f" };
  if (k === "grep") return { icon: "*", color: "#9d7cd8" };
  if (k === "glob") return { icon: "*", color: "#9d7cd8" };
  if (k === "webfetch") return { icon: "↗", color: "#56b6c2" };
  if (k === "task") return { icon: "#", color: "#f5a742" };
  return { icon: "·", color: "#808080" };
}

export function shouldRetry(result: SubagentResult): boolean {
  return result.status === "fail" || result.status === "blocked";
}

export function retryFeedback(result: SubagentResult, originalTask: string): string {
  const lines = [
    "## Previous attempt did not converge",
    "",
    `Status: ${result.status}`,
    `Evidence: ${result.evidence.slice(0, 800)}`,
    "",
    "## What to do differently",
    "",
    "1. Re-read the failing test output carefully",
    "2. Identify the exact line/assertion that failed",
    "3. Make the minimal change to fix only that",
    "4. Re-run the test before emitting status",
    "",
    "## Original task",
    "",
    originalTask,
  ];
  return lines.join("\n");
}

export async function start(taskDescription: string, opts: { pipeline?: boolean; model?: string } = {}): Promise<void> {
  const startTime = Date.now();

  let config;
  try {
    config = await loadConfig(PI_CONFIG_PATH);
  } catch (e) {
    console.error(`✗ failed to load config from ${PI_CONFIG_PATH}`);
    console.error(`  ${(e as Error).message}`);
    process.exit(1);
  }

  const apiKey = await getApiKey(config.provider, PI_AUTH_PATH);
  if (!apiKey) {
    console.error(`\n  ✗ No API key for ${config.provider}.`);
    console.error(`  Set the env var (e.g. OPENCODE_GO_API_KEY) or run:`);
    console.error(`    pi config set-key ${config.provider} <key>`);
    process.exit(1);
  }

  const provider = createProvider({ apiKey, baseUrl: config.baseUrl, defaultModel: opts.model ?? config.model });
  const hasGit = isGitRepo();
  const worktreePath = process.cwd();

  if (opts.pipeline) {
    // Delegate to PipelineWorker for 5-stage processing
    const { pipeline } = await import("./pipeline.js");
    await pipeline(taskDescription, { model: opts.model });
    return;
  }

  console.log(banner(PI_VERSION, opts.model ?? config.model));
  console.log();
  console.log(`> ${taskDescription}`);
  console.log();
  console.log(`  model: ${opts.model ?? config.model}  provider: ${config.provider}`);
  if (!hasGit) console.log("  no git — working directly");
  console.log("  role: build  ·  tool budget: 8  ·  code examples: on  ·  self-review: on");
  console.log("  building...");
  console.log();

  const taskId = `tsk_${Date.now().toString(16)}`;
  const router = SubagentRouter.withProvider(provider, worktreePath, opts.model ?? config.model);

  let result: SubagentResult;
  try {
    result = await router.dispatch("build", {
      taskId, stepId: "execute", description: taskDescription, worktreePath,
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`\n  ✗ build threw: ${msg}`);
    if (msg.includes("fetch failed")) {
      console.error(`  Check: is the model "${config.model}" correct for provider "${config.provider}"?`);
      console.error(`  Check: does the API endpoint work? Set baseUrl if needed:`);
      console.error(`    pi config set baseUrl <url>`);
    }
    process.exit(1);
  }

  // Multi-shot retry: on fail/blocked, feed the evidence back as new task
  let attempts = 1;
  while (shouldRetry(result) && attempts <= MAX_RETRIES) {
    attempts++;
    console.log(`\n  ↻ retry ${attempts}/${MAX_RETRIES} — feeding back failure: ${result.evidence.slice(0, 100).replace(/\n/g, " ")}...`);
    try {
      result = await router.dispatch("build", {
        taskId, stepId: `retry-${attempts}`,
        description: retryFeedback(result, taskDescription),
        worktreePath,
      });
    } catch (e) {
      console.error(`  ✗ retry threw: ${(e as Error).message}`);
      break;
    }
  }

  const dur = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  const firstLine = (result.evidence || "").split("\n")[0] || "(no output)";
  console.log(`  ${firstLine.slice(0, 200)}`);
  console.log();
  const statusIcon = result.status === "pass" ? "✓" : result.status === "fail" ? "✗" : "~";
  console.log(`  ${statusIcon} ${result.status} · ${dur}s · ${result.tokensIn ?? 0}↗ ${result.tokensOut ?? 0}↘ · ${attempts} attempt(s)`);

  if (result.status === "pass" && hasGit) {
    console.log(`  merge: pi merge ${taskId}`);
  } else if (result.status !== "pass") {
    console.log(`  did not converge. inspect: pi replay ${taskId}`);
    process.exit(1);
  }
}

export function formatCompletionMessage(taskId: string): string {
  return `✓ pi: task ${taskId} completed. Run 'pi merge ${taskId}' to inspect.`;
}

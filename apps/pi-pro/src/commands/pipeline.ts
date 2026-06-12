import { loadConfig, getApiKey, createProvider, isAnthropicModel } from "@pi/provider";
import { PipelineWorker } from "@pi/subagent";
import {
  createBashTool,
  createReadTool,
  createWriteTool,
  createEditTool,
  createGrepTool,
  createGlobTool,
  createWebfetchTool,
} from "@pi/tools";
import type { ToolInstance } from "@pi/subagent";
import { PI_CONFIG_PATH, PI_AUTH_PATH } from "../config-paths.js";
import { banner } from "../logo.js";
import { isGitRepo } from "./start.js";

const PI_VERSION = "0.3.0";

export interface PipelineOpts {
  model?: string;
  modelMap?: Record<string, string>;
  qualityThreshold?: number;
  maxRefineLoops?: number;
}

function makeTools(workdir: string): ToolInstance[] {
  return [
    createBashTool({ cwd: workdir }) as unknown as ToolInstance,
    createReadTool({ cwd: workdir }) as unknown as ToolInstance,
    createWriteTool({ cwd: workdir }) as unknown as ToolInstance,
    createEditTool({ cwd: workdir }) as unknown as ToolInstance,
    createGrepTool({ cwd: workdir }) as unknown as ToolInstance,
    createGlobTool({ cwd: workdir }) as unknown as ToolInstance,
    createWebfetchTool() as unknown as ToolInstance,
  ];
}

export async function pipeline(task: string, opts: PipelineOpts = {}): Promise<void> {
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
    console.error(`    pi config set-key ${config.provider} <key>`);
    process.exit(1);
  }

  const model = opts.model ?? config.model;
  const workdir = process.cwd();
  const hasGit = isGitRepo();

  console.log(banner(PI_VERSION, model));
  console.log();
  console.log(`> ${task}`);
  console.log();
  console.log(`  mode: 5-stage pipeline (analyze → plan → execute → review → refine)`);
  console.log(`  model: ${model}  provider: ${config.provider}${isAnthropicModel(model) ? " (Anthropic-format)" : " (OpenAI-format)"}`);
  console.log(`  quality threshold: ${opts.qualityThreshold ?? 20}/25`);
  console.log(`  max refine loops: ${opts.maxRefineLoops ?? 2}`);
  if (!hasGit) console.log("  no git — working directly");
  console.log();
  console.log("  stage 1/5: analyze");
  console.log("  stage 2/5: plan");
  console.log("  stage 3/5: execute");
  console.log("  stage 4/5: review");
  console.log("  stage 5/5: refine (if quality < threshold)");
  console.log();

  const provider = createProvider({ apiKey, baseUrl: config.baseUrl, defaultModel: model });
  const tools = makeTools(workdir);
  const worker = PipelineWorker.default(provider, tools, workdir, opts.modelMap ?? {}, {
    qualityThreshold: opts.qualityThreshold,
    maxRefineLoops: opts.maxRefineLoops,
  });

  const taskId = `tsk_${Date.now().toString(16)}`;
  let result;
  try {
    result = await worker.run({ taskId, stepId: "pipeline", description: task, worktreePath: workdir });
  } catch (e) {
    console.error(`\n  ✗ pipeline threw: ${(e as Error).message}`);
    process.exit(1);
  }

  const dur = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  console.log("  ── stage results ──");
  for (const stage of result.stages) {
    const icon = stage.status === "pass" ? "✓" : stage.status === "fail" ? "✗" : "~";
    console.log(`    ${icon} ${stage.name.padEnd(10)} ${stage.status.padEnd(8)} ${stage.tokensIn}↗ ${stage.tokensOut}↘ ${stage.durationMs}ms`);
  }
  console.log();
  console.log(`  ${result.evidence.split("\n")[0]?.slice(0, 200) ?? ""}`);
  console.log();
  const quality = result.qualityScore !== undefined ? `${result.qualityScore}/25` : "n/a";
  const statusIcon = result.status === "pass" ? "✓" : result.status === "fail" ? "✗" : "~";
  console.log(`  ${statusIcon} ${result.status} · quality=${quality} · ${dur}s · ${result.tokensIn}↗ ${result.tokensOut}↘`);

  if (result.status === "pass" && hasGit) {
    console.log(`  merge: pi merge ${taskId}`);
  } else if (result.status !== "pass") {
    console.log(`  did not converge. inspect: pi replay ${taskId}`);
    process.exit(1);
  }
}

/**
 * v0.6.0 swarm CLI.
 *
 * Refactors the v0.4.0 simple parallel-dispatch swarm to use the new
 * @pi/swarm Orchestrator. New flags:
 *   --plan           show plan + roster, then run
 *   --budget=<usd>  per-swarm cost cap (default $2.00)
 *   --max-retries=N override per-subagent retry policy
 *   --dry-run        show plan, do not dispatch
 *   --continue <id>  resume a paused swarm
 *   --status <id>    print current state
 *   --merge <id>     merge builder's worktree into main
 *   --list           list all swarms on disk
 *
 * Multica preserved as one-shot direct dispatch (bypasses orchestrator).
 */

import { loadConfig, getApiKey, createProvider, type Provider } from "@pi/provider";
import { SubagentRouter } from "@pi/subagent";
import { Orchestrator, type SubagentDispatcher, swarmId } from "@pi/swarm";
import { Scratchpad } from "@pi/swarm";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PI_CONFIG_PATH, PI_AUTH_PATH } from "../config-paths.js";

// ---- Multica (preserved from v0.4.0) --------------------------------

const AGENT_ROLES = [
  "build",
  "test-runner",
  "code-reviewer",
  "security-auditor",
  "planner",
  "researcher",
] as const;

type SwarmRole = typeof AGENT_ROLES[number];

interface SwarmTask {
  role: SwarmRole;
  goal: string;
}

const MULTICA_NAMED_AGENTS: Record<string, { role: SwarmRole; model: string; description: string }> = {
  jorvis: { role: "planner", model: "minimax-m3", description: "Planning + strategy" },
  jouono: { role: "researcher", model: "minimax-m3", description: "Research + exploration" },
  scout: { role: "researcher", model: "deepseek-v4-flash", description: "Quick recon" },
  summit: { role: "build", model: "minimax-m3", description: "Full-stack build" },
  quill: { role: "code-reviewer", model: "minimax-m3", description: "Code review" },
  surge: { role: "test-runner", model: "deepseek-v4-flash", description: "Test execution" },
  cipher: { role: "security-auditor", model: "minimax-m3", description: "Security audit" },
  forge: { role: "build", model: "deepseek-v4-flash", description: "Quick build" },
};

// ---- Swarm flag parsing -----------------------------------------------

export interface SwarmFlags {
  plan?: boolean;
  budget?: number;
  maxRetries?: number;
  dryRun?: boolean;
  continueId?: string;
  statusId?: string;
  mergeId?: string;
  list?: boolean;
  legacy?: boolean; // v0.4.0 simple parallel dispatch
}

export function parseSwarmFlags(args: string[]): { positional: string[]; flags: SwarmFlags } {
  const positional: string[] = [];
  const flags: SwarmFlags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--plan") flags.plan = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--list") flags.list = true;
    else if (a === "--legacy") flags.legacy = true;
    else if (a === "--budget") flags.budget = parseFloat(args[++i] ?? "2");
    else if (a === "--max-retries") flags.maxRetries = parseInt(args[++i] ?? "2", 10);
    else if (a === "--continue") flags.continueId = args[++i];
    else if (a === "--status") flags.statusId = args[++i];
    else if (a === "--merge") flags.mergeId = args[++i];
    else if (a.startsWith("--")) { /* ignore unknown */ }
    else positional.push(a);
  }
  return { positional, flags };
}

// ---- v0.6.0 orchestrator-backed swarm --------------------------------

/**
 * Build a SubagentDispatcher that wraps SubagentRouter for a given
 * (provider, model). Each subagent role gets its own provider pinned
 * to cheap or main per the v0.5.0 cascade map.
 */
function makeRouterDispatcher(opts: {
  apiKey: string;
  baseUrl?: string;
  provider: string;
  mainModel: string;
}): SubagentDispatcher {
  return async (role, goal, _input: { plan: string; priorContext: string }) => {
    // Pick model per role. Builder = main; planner/researcher/critic/test-runner = cheap.
    const cheapModel = pickCheapModel(opts.provider, opts.mainModel);
    const model = role === "builder" ? opts.mainModel : cheapModel;
    const provider: Provider = createProvider({ apiKey: opts.apiKey, baseUrl: opts.baseUrl, defaultModel: model });
    // Map swarm role → subagent Role. Swarm's "builder" → subagent's "build".
    const subRole = role === "builder" ? "build" : role;
    const router = SubagentRouter.withProvider(provider, opts.provider, model);
    const start = Date.now();
    const rr = await router.dispatch(subRole as never, {
      taskId: `swarm-${Date.now()}-${role}`,
      stepId: role,
      description: goal,
      worktreePath: process.cwd(),
    });
    return {
      role,
      attempts: [{
        attempt: 1,
        status: rr.status,
        evidence: rr.evidence,
        tokensIn: rr.tokensIn,
        tokensOut: rr.tokensOut,
        costUsd: 0,
        durationMs: Date.now() - start,
      }],
      final: {
        attempt: 1, status: rr.status, evidence: rr.evidence,
        tokensIn: rr.tokensIn, tokensOut: rr.tokensOut, costUsd: 0, durationMs: Date.now() - start,
      },
      totalCostUsd: 0,
      totalTokensIn: rr.tokensIn,
      totalTokensOut: rr.tokensOut,
    };
  };
}

function pickCheapModel(provider: string, mainModel: string): string {
  if (provider === "anthropic") return "claude-haiku-4-5";
  if (provider === "openai") return "gpt-5-mini";
  if (mainModel === "deepseek-v4-pro") return "deepseek-v4-flash";
  if (mainModel === "claude-sonnet-4-5" || mainModel === "claude-sonnet-4-6") return "claude-haiku-4-5";
  if (mainModel === "claude-opus-4-5" || mainModel === "claude-opus-4-7") return "claude-sonnet-4-6";
  if (mainModel === "gpt-5") return "gpt-5-mini";
  if (mainModel === "qwen3.7-max") return "qwen3.6-plus";
  return mainModel;
}

/**
 * v0.6.0 main entry: run an orchestrator-backed swarm.
 * `pi swarm "<goal>"` with optional flags.
 */
export async function swarmGoal(goal: string, workdir: string, flags: SwarmFlags = {}): Promise<void> {
  const cfg = await loadConfig(PI_CONFIG_PATH);
  const apiKey = await getApiKey(cfg.provider, PI_AUTH_PATH);
  if (!apiKey) { console.error("No API key configured."); process.exit(1); }

  if (flags.plan) {
    // Plan-only: render the plan via the orchestrator's writePlan path.
    const id = swarmId(`swarm_plan_${Date.now().toString(36)}`);
    const orch = new Orchestrator({
      rootDir: workdir, swarmId: id, goal,
      provider: cfg.provider, mainModel: cfg.model,
      budgetUsd: flags.budget,
      maxRetries: flags.maxRetries,
      dispatcher: makeRouterDispatcher({ apiKey, baseUrl: cfg.baseUrl, provider: cfg.provider, mainModel: cfg.model }),
      scratchpadBase: join(workdir, ".pi-pro", "swarm"),
    });
    const plan = await orch.writePlan();
    console.log(renderPlanHuman(plan));
    if (!flags.dryRun) {
      console.log("\n(swarm not dispatched; pass --plan without --dry-run to run)");
    }
    return;
  }

  if (flags.dryRun) {
    const id = swarmId(`swarm_dry_${Date.now().toString(36)}`);
    const orch = new Orchestrator({
      rootDir: workdir, swarmId: id, goal,
      provider: cfg.provider, mainModel: cfg.model,
      budgetUsd: flags.budget,
      maxRetries: flags.maxRetries,
      dispatcher: makeRouterDispatcher({ apiKey, baseUrl: cfg.baseUrl, provider: cfg.provider, mainModel: cfg.model }),
      scratchpadBase: join(workdir, ".pi-pro", "swarm"),
    });
    const result = await orch.run();
    console.log(`[dry-run] plan written to .pi-pro/swarm/${id}/plan.md`);
    console.log(`status: ${result.status}, cost: $${result.totalCostUsd.toFixed(4)}`);
    return;
  }

  // Full run
  const id = swarmId(`swarm_${Date.now().toString(36)}`);
  console.log(`\n  swarm ${id}  goal: ${goal}\n`);
  const orch = new Orchestrator({
    rootDir: workdir, swarmId: id, goal,
    provider: cfg.provider, mainModel: cfg.model,
    budgetUsd: flags.budget,
    maxRetries: flags.maxRetries,
    dispatcher: makeRouterDispatcher({ apiKey, baseUrl: cfg.baseUrl, provider: cfg.provider, mainModel: cfg.model }),
    scratchpadBase: join(workdir, ".pi-pro", "swarm"),
  });
  const result = await orch.run();

  console.log(`\n  swarm ${id} → ${result.status.toUpperCase()}`);
  console.log(`  total: $${result.totalCostUsd.toFixed(4)} · ${(result.totalDurationMs / 1000).toFixed(1)}s`);
  for (const [role, r] of Object.entries(result.finalResults)) {
    if (!r) continue;
    const icon = r.final.status === "pass" ? "ok" : r.final.status === "fail" ? "FAIL" : "~";
    console.log(`    ${icon.padEnd(4)} ${role.padEnd(13)} (${r.attempts.length} attempt${r.attempts.length === 1 ? "" : "s"}, $${r.totalCostUsd.toFixed(4)})`);
  }
  if (result.status === "paused" && result.pauseReason) {
    console.log(`\n  pause reason: ${result.pauseReason.kind}`);
    console.log(`  resume:  pi swarm --continue ${id} --budget=<higher>`);
  }
  if (result.mergedWorktree) {
    console.log(`\n  merged: ${result.mergedWorktree.branch}`);
  }
}

function renderPlanHuman(plan: { roster: Array<{ role: string; model: string; maxRetries: number; tools: string[] }>; topo: string[]; budget: { limitUsd: number; warnRatio?: number }; goal: string; swarmId: string }): string {
  const lines: string[] = [];
  lines.push(`# Swarm plan: ${plan.goal}`);
  lines.push(`swarmId: ${plan.swarmId}`);
  lines.push(`budget: $${plan.budget.limitUsd.toFixed(2)} (warn at ${Math.round((plan.budget.warnRatio ?? 0.5) * 100)}%)`);
  lines.push("");
  lines.push("Roster:");
  for (const r of plan.roster) {
    lines.push(`  ${r.role.padEnd(13)} ${r.model.padEnd(22)} tools: ${r.tools.join(",")}  retries: ${r.maxRetries}`);
  }
  lines.push("");
  lines.push("Execution:");
  lines.push("  " + plan.topo.join(" → "));
  return lines.join("\n");
}

// ---- swarm --continue, --status, --merge, --list ----------------------

export async function swarmContinue(id: string, workdir: string, flags: SwarmFlags = {}): Promise<void> {
  const cfg = await loadConfig(PI_CONFIG_PATH);
  const apiKey = await getApiKey(cfg.provider, PI_AUTH_PATH);
  if (!apiKey) { console.error("No API key configured."); process.exit(1); }
  const swarmIdValue = swarmId(id);
  const orch = new Orchestrator({
    rootDir: workdir,
    swarmId: swarmIdValue,
    goal: "(resumed)",
    provider: cfg.provider,
    mainModel: cfg.model,
    budgetUsd: flags.budget,
    maxRetries: flags.maxRetries,
    dispatcher: makeRouterDispatcher({ apiKey, baseUrl: cfg.baseUrl, provider: cfg.provider, mainModel: cfg.model }),
    scratchpadBase: join(workdir, ".pi-pro", "swarm"),
  });
  const result = await orch.run();
  console.log(`resumed ${id} → ${result.status}`);
}

export async function swarmStatus(id: string, workdir: string): Promise<void> {
  const swarmDir = join(workdir, ".pi-pro", "swarm", id);
  try {
    const stateRaw = await readFile(join(swarmDir, "state.json"), "utf8");
    const planRaw = await readFile(join(swarmDir, "plan.md"), "utf8");
    console.log(`swarm ${id}:`);
    console.log(planRaw.split("\n").slice(0, 3).map(l => "  " + l).join("\n"));
    console.log("\nstate:");
    const state = JSON.parse(stateRaw);
    console.log(JSON.stringify(state, null, 2).split("\n").map(l => "  " + l).join("\n"));
  } catch {
    console.error(`no swarm found at ${swarmDir}`);
    process.exit(1);
  }
}

export async function swarmMerge(id: string, workdir: string): Promise<void> {
  const { mergeWorktree } = await import("@pi/swarm");
  const result = mergeWorktree({
    rootDir: workdir,
    swarmId: swarmId(id),
    role: "builder",
  });
  if (result.success) {
    console.log(`merged: ${result.mergedFiles.length} files`);
    for (const f of result.mergedFiles) console.log(`  + ${f}`);
  } else {
    console.error(`merge failed: ${result.conflicts.length} conflicts`);
    for (const c of result.conflicts) console.error(`  ! ${c}`);
    process.exit(1);
  }
}

export async function swarmList(workdir: string): Promise<void> {
  const swarmDir = join(workdir, ".pi-pro", "swarm");
  let entries: string[];
  try {
    entries = await readdir(swarmDir);
  } catch {
    console.log("no swarms found");
    return;
  }
  console.log(`swarms in ${swarmDir}:`);
  for (const e of entries.sort()) console.log(`  ${e}`);
}

// ---- v0.4.0 simple parallel-dispatch (--legacy) ---------------------

async function dispatchSwarmLegacy(
  tasks: SwarmTask[],
  apiKey: string,
  workdir: string,
  baseUrl: string | undefined,
  defaultModel: string,
  modelOverride: Record<string, string> = {},
): Promise<Array<{ role: SwarmRole; goal: string; status: string; evidence: string; tokensIn: number; tokensOut: number; durationMs: number }>> {
  const results = [];
  for (const task of tasks) {
    const model = modelOverride[task.role] ?? defaultModel;
    const provider = createProvider({ apiKey, baseUrl, defaultModel: model });
    const router = SubagentRouter.withProvider(provider, workdir, model);
    const start = Date.now();
    const rr = await router.dispatch(task.role, {
      taskId: `swarm-${Date.now()}-${task.role}`,
      stepId: task.role,
      description: task.goal,
      worktreePath: workdir,
    });
    results.push({
      role: task.role,
      goal: task.goal,
      status: rr.status,
      evidence: rr.evidence,
      tokensIn: rr.tokensIn,
      tokensOut: rr.tokensOut,
      durationMs: Date.now() - start,
    });
  }
  return results;
}

function printResults(title: string, results: Array<{ role: string; status: string; evidence: string; tokensIn: number; tokensOut: number; durationMs: number }>): void {
  console.log();
  console.log("=".repeat(50));
  console.log(`  ${title}`);
  console.log("=".repeat(50));
  console.log();
  let pass = 0;
  for (const r of results) {
    const icon = r.status === "pass" ? "ok" : r.status === "fail" ? "FAIL" : "~";
    console.log(`  ${icon.padEnd(4)} ${r.role.padEnd(16)} | ${r.evidence.slice(0, 90).replace(/\n/g, " ")}`);
    if (r.status === "pass") pass++;
  }
  console.log();
  console.log(`  ${pass}/${results.length} agents passed`);
  console.log(`  total tokens: ${results.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0)}`);
  console.log(`  wall: ${(results.reduce((s, r) => s + r.durationMs, 0) / 1000).toFixed(1)}s`);
}

// ---- Single-purpose commands (preserved) -----------------------------

export async function swarmSearch(query: string, workdir: string = process.cwd()): Promise<void> {
  const cfg = await loadConfig(PI_CONFIG_PATH);
  const apiKey = await getApiKey(cfg.provider, PI_AUTH_PATH);
  if (!apiKey) { console.error("No API key configured."); process.exit(1); }
  const tasks: SwarmTask[] = [
    { role: "researcher", goal: `Search the codebase for: ${query}. Read all matching files and report what you found.` },
  ];
  const results = await dispatchSwarmLegacy(tasks, apiKey, workdir, cfg.baseUrl, cfg.model);
  console.log();
  console.log(results[0].evidence);
}

export async function swarmAudit(workdir: string = process.cwd()): Promise<void> {
  const cfg = await loadConfig(PI_CONFIG_PATH);
  const apiKey = await getApiKey(cfg.provider, PI_AUTH_PATH);
  if (!apiKey) { console.error("No API key configured."); process.exit(1); }
  const tasks: SwarmTask[] = [
    { role: "security-auditor", goal: "Audit the entire codebase for security issues: hardcoded secrets, SQL injection, XSS, path traversal, unsafe shell commands, missing auth." },
    { role: "code-reviewer", goal: "Review the codebase for quality issues: naming, error handling, edge cases, maintainability." },
  ];
  const results = await dispatchSwarmLegacy(tasks, apiKey, workdir, cfg.baseUrl, cfg.model);
  for (const r of results) {
    console.log(`\n  ### ${r.role}\n`);
    console.log(`  ${r.evidence.replace(/\n/g, "\n  ")}`);
  }
}

export async function swarmReview(workdir: string = process.cwd()): Promise<void> {
  const cfg = await loadConfig(PI_CONFIG_PATH);
  const apiKey = await getApiKey(cfg.provider, PI_AUTH_PATH);
  if (!apiKey) { console.error("No API key configured."); process.exit(1); }
  const tasks: SwarmTask[] = [
    { role: "code-reviewer", goal: "Review all recent changes. Score quality on: idiomatic patterns, efficiency, safety, maintainability, edge cases. List specific issues with file:line." },
  ];
  const results = await dispatchSwarmLegacy(tasks, apiKey, workdir, cfg.baseUrl, cfg.model);
  console.log();
  console.log(results[0].evidence);
}

export async function multicaSwarm(agentName: string, task: string, workdir: string = process.cwd()): Promise<void> {
  const cfg = await loadConfig(PI_CONFIG_PATH);
  const apiKey = await getApiKey(cfg.provider, PI_AUTH_PATH);
  if (!apiKey) { console.error("No API key configured."); process.exit(1); }
  const agent = MULTICA_NAMED_AGENTS[agentName.toLowerCase()];
  if (!agent) {
    console.error(`unknown multica agent: ${agentName}`);
    console.error(`  available: ${Object.keys(MULTICA_NAMED_AGENTS).join(", ")}`);
    process.exit(1);
  }
  console.log(`\n  multica · ${agentName} (${agent.role} / ${agent.model})\n`);
  console.log(`  ${agent.description}\n`);
  console.log(`  > ${task}\n`);
  const tasks: SwarmTask[] = [{ role: agent.role, goal: task }];
  const modelMap: Record<string, string> = { [agent.role]: agent.model };
  const results = await dispatchSwarmLegacy(tasks, apiKey, workdir, cfg.baseUrl, cfg.model, modelMap);
  printResults(`${agentName} RESULT`, results);
}

export function listMulticaAgents(): string[] {
  return Object.keys(MULTICA_NAMED_AGENTS);
}

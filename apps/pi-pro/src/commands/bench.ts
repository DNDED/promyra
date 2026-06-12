import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, getApiKey, createProvider } from "@pi/provider";
import { LlmBenchRunner, type BenchSummary, type BenchResult } from "@pi/bench";
import { PI_CONFIG_PATH, PI_AUTH_PATH } from "../config-paths.js";

const PI_VERSION = "0.3.0";

export interface BenchOpts {
  tasks?: string[];
  model?: string;
  parallel?: boolean;
  concurrency?: number;
  pipeline?: boolean;
  fixtures?: string;
}

function printSummary(summary: BenchSummary): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`=== pi bench v${PI_VERSION} ===`);
  lines.push("");
  for (const r of summary.results) {
    const status = r.completed ? "✓" : r.skipped ? "~" : "✗";
    lines.push(`  ${status} ${r.taskId.padEnd(24)} ${r.fixture.padEnd(15)} ${r.testCommand}`);
    if (r.skipped) lines.push(`     skipped: ${r.skipReason}`);
    if (r.error && !r.skipped) lines.push(`     error: ${r.error}`);
  }
  const total = summary.total;
  const passRate = total === 0 ? 0 : (summary.completed / total) * 100;
  const effective = total - summary.skipped;
  const effRate = effective === 0 ? 0 : (summary.completed / effective) * 100;
  lines.push("");
  lines.push(`Result: ${summary.completed}/${total} one-shot (${passRate.toFixed(0)}% raw, ${effRate.toFixed(0)}% excluding skipped)`);
  lines.push(`Skipped: ${summary.skipped} (missing local toolchain)`);
  lines.push(`Tokens: in=${summary.tokensIn}, out=${summary.tokensOut}`);
  lines.push(`Wall:   ${(summary.wallMs / 1000).toFixed(1)}s`);
  return lines.join("\n") + "\n";
}

function printSummaryJson(summary: BenchSummary): string {
  const results = summary.results.map((r) => ({
    taskId: r.taskId,
    fixture: r.fixture,
    description: r.description,
    completed: r.completed,
    skipped: r.skipped ?? false,
    skipReason: r.skipReason,
    error: r.error,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    wallMs: r.wallMs,
    testCommand: r.testCommand,
    testExitCode: r.testExitCode,
  }));
  return JSON.stringify({
    total: summary.total,
    completed: summary.completed,
    failed: summary.failed,
    skipped: summary.skipped,
    passRate: summary.total === 0 ? 0 : (summary.completed / summary.total) * 100,
    effectiveRate: (summary.total - summary.skipped) === 0 ? 0 : (summary.completed / (summary.total - summary.skipped)) * 100,
    tokensIn: summary.tokensIn,
    tokensOut: summary.tokensOut,
    wallMs: summary.wallMs,
    wallSec: (summary.wallMs / 1000).toFixed(1),
    results,
  }, null, 2);
}

export async function benchCommand(opts: BenchOpts = {}): Promise<void> {
  const cfg = await loadConfig(PI_CONFIG_PATH);
  const apiKey = await getApiKey(cfg.provider, PI_AUTH_PATH);
  if (!apiKey) {
    console.error(`pi bench: no API key for ${cfg.provider}.`);
    console.error(`Set the env var or run: pi config set-key ${cfg.provider} <key>`);
    process.exit(1);
  }

  const model = opts.model ?? cfg.model;
  const workdir = mkdtempSync(join(tmpdir(), "pi-bench-"));
  const jsonOutput = process.argv.includes("--json");

  // Default fixtures path: walk up from cwd looking for the pi-pro root
  // (marked by `apps/pi/package.json`), then look for `bench/fixtures` inside.
  // Also check process.env.PROMYRA_ROOT as override, and the binary's own
  // location (apps/pi/bin/pi → apps/pi → pi-pro root).
  function findDefaultFixtures(): string {
    const override = process.env.PROMYRA_ROOT;
    if (override) {
      const c = join(override, "bench", "fixtures");
      if (existsSync(c)) return c;
    }
    // Try walking up from this file's location
    try {
      const thisFile = fileURLToPath(import.meta.url);
      // dist/commands/bench.js → apps/pi → pi-pro root
      let dir = dirname(thisFile);
      for (let i = 0; i < 6; i++) {
        if (existsSync(join(dir, "apps", "pi", "package.json")) && existsSync(join(dir, "bench", "fixtures"))) {
          return join(dir, "bench", "fixtures");
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    } catch { /* fallback to cwd walk */ }
    // Walk up from cwd as last resort
    let dir = process.cwd();
    for (let i = 0; i < 16; i++) {
      if (existsSync(join(dir, "apps", "pi", "package.json")) && existsSync(join(dir, "bench", "fixtures"))) {
        return join(dir, "bench", "fixtures");
      }
      const parent = join(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
    return "bench/fixtures";
  }

  console.log(`pi bench v${PI_VERSION}`);
  console.log(`  model: ${model}  provider: ${cfg.provider}  pipeline: ${opts.pipeline ? "on" : "off"}`);
  console.log(`  workspace: ${workdir}`);
  console.log();

  try {
    const provider = createProvider({ apiKey, baseUrl: cfg.baseUrl, defaultModel: model });
    const runnerOpts: ConstructorParameters<typeof LlmBenchRunner>[1] = {
      workspaceRoot: workdir,
      model,
      usePipeline: opts.pipeline,
    };
    const fixturesPath = opts.fixtures ?? findDefaultFixtures();
    runnerOpts.benchFixturesRel = fixturesPath;
    console.log(`  fixtures:    ${fixturesPath}`);
    const runner = new LlmBenchRunner(provider, runnerOpts);
    const { TASKS: allTasks } = await import("@pi/bench");
    const taskFilter = opts.tasks && opts.tasks.length > 0 ? new Set(opts.tasks) : null;
    const taskCount = taskFilter ? allTasks.filter((t: { id: string }) => taskFilter.has(t.id)).length : allTasks.length;
    const taskList = taskFilter
      ? allTasks.filter((t: { id: string }) => taskFilter.has(t.id)).map((t: { id: string }) => t.id).join(", ")
      : allTasks.map((t: { id: string }) => t.id).join(", ");
    console.log(`  tasks:       ${taskCount} (${taskList})`);
    console.log();
    console.log("  running tasks (each may take 30-90s)...");
    const summary: BenchSummary = opts.parallel
      ? await runner.runAllParallel(undefined, opts.concurrency)
      : await runner.runAll();

    if (jsonOutput) {
      process.stdout.write(printSummaryJson(summary) + "\n");
    } else {
      process.stdout.write(printSummary(summary));
    }
    process.exit(summary.completed === summary.total ? 0 : 1);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

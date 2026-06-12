/**
 * v0.5.0 bench attribution runner.
 *
 * Runs the same task set with different v0.5.0 flag configurations
 * and reports per-technique impact on cost / wall / pass rate.
 *
 * Usage:
 *   const { rows } = await runAttribution(provider, opts);
 *   // rows: [{ flagLabel, totalCostUsd, avgWallMs, passRate, ... }]
 */

import type { OptimizerFlags } from "@pi/optimizer";
import { LlmBenchRunner, type BenchResult, type LlmBenchRunnerOpts } from "./llm-bench-runner.js";

export type FlagConfigName = "all-on" | "all-off" | "cache-off" | "cascade-off" | "parallel-off" | "repomap-off";

export const FLAG_CONFIGS: Record<FlagConfigName, { label: string; flags: OptimizerFlags }> = {
  "all-on": {
    label: "all-on",
    flags: { cache: true, repoMap: true, cascade: true, parallelTools: true, telemetry: true },
  },
  "all-off": {
    label: "all-off",
    flags: { cache: false, repoMap: false, cascade: false, parallelTools: false, telemetry: false },
  },
  "cache-off": {
    label: "cache-off",
    flags: { cache: false, repoMap: true, cascade: true, parallelTools: true, telemetry: true },
  },
  "cascade-off": {
    label: "cascade-off",
    flags: { cache: true, repoMap: true, cascade: false, parallelTools: true, telemetry: true },
  },
  "parallel-off": {
    label: "parallel-off",
    flags: { cache: true, repoMap: true, cascade: true, parallelTools: false, telemetry: true },
  },
  "repomap-off": {
    label: "repomap-off",
    flags: { cache: true, repoMap: false, cascade: true, parallelTools: true, telemetry: true },
  },
};

export interface AttributionRow {
  flagLabel: string;
  totalCostUsd: number;
  avgWallMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  passRate: number;
  passCount: number;
  totalCount: number;
  skipCount: number;
  results: BenchResult[];
}

export interface AttributionReport {
  rows: AttributionRow[];
  /** Delta vs baseline (first config in `configs`). */
  deltas: Array<{
    flagLabel: string;
    costDelta: number;
    costDeltaPct: number;
    wallDelta: number;
    wallDeltaPct: number;
    passRateDelta: number;
  }>;
}

/**
 * Run the bench with each flag configuration and return a comparison.
 * The first config is the baseline; deltas are computed against it.
 */
export async function runAttribution(
  provider: import("@pi/provider").Provider,
  baseOpts: LlmBenchRunnerOpts,
  configs: FlagConfigName[] = ["all-on", "all-off", "cache-off", "cascade-off"],
): Promise<AttributionReport> {
  const rows: AttributionRow[] = [];
  for (const cfgName of configs) {
    const cfg = FLAG_CONFIGS[cfgName];
    const opts: LlmBenchRunnerOpts = {
      ...baseOpts,
      flags: cfg.flags,
      flagLabel: cfg.label,
    };
    const runner = new LlmBenchRunner(provider, opts);
    const summary = await runner.runAll();
    const totalCost = summary.results.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const totalWall = summary.results.reduce((s, r) => s + r.wallMs, 0);
    const avgWall = summary.results.length > 0 ? totalWall / summary.results.length : 0;
    const totalIn = summary.tokensIn;
    const totalOut = summary.tokensOut;
    const passed = summary.results.filter(r => r.completed).length;
    const total = summary.results.length;
    const skipped = summary.results.filter(r => r.skipped).length;
    rows.push({
      flagLabel: cfg.label,
      totalCostUsd: totalCost,
      avgWallMs: avgWall,
      totalTokensIn: totalIn,
      totalTokensOut: totalOut,
      passRate: total > 0 ? passed / total : 0,
      passCount: passed,
      totalCount: total,
      skipCount: skipped,
      results: summary.results,
    });
  }

  // Compute deltas vs baseline (first row)
  const baseline = rows[0];
  const deltas = rows.map(row => {
    const baselineCost = baseline?.totalCostUsd ?? 0;
    const baselineWall = baseline?.avgWallMs ?? 0;
    const baselinePass = baseline?.passRate ?? 0;
    return {
      flagLabel: row.flagLabel,
      costDelta: row.totalCostUsd - baselineCost,
      costDeltaPct: baselineCost > 0 ? ((row.totalCostUsd - baselineCost) / baselineCost) * 100 : 0,
      wallDelta: row.avgWallMs - baselineWall,
      wallDeltaPct: baselineWall > 0 ? ((row.avgWallMs - baselineWall) / baselineWall) * 100 : 0,
      passRateDelta: row.passRate - baselinePass,
    };
  });

  return { rows, deltas };
}

export function formatAttribution(report: AttributionReport): string {
  const lines: string[] = [];
  lines.push("## v0.5.0 Bench Attribution");
  lines.push("");
  lines.push("| flag        | cost    | wall/avg | pass rate |");
  lines.push("|-------------|---------|----------|-----------|");
  for (const row of report.rows) {
    const cost = `$${row.totalCostUsd.toFixed(4)}`;
    const wall = row.avgWallMs > 0 ? `${(row.avgWallMs / 1000).toFixed(1)}s` : "—";
    const pass = `${row.passCount}/${row.totalCount}${row.skipCount > 0 ? ` (${row.skipCount} skip)` : ""}`;
    lines.push(`| ${row.flagLabel.padEnd(11)} | ${cost.padStart(7)} | ${wall.padStart(8)} | ${pass.padStart(9)} |`);
  }
  if (report.deltas.length > 1) {
    const base = report.deltas[0];
    if (base) {
      lines.push("");
      lines.push(`### Delta vs ${base.flagLabel}`);
      lines.push("");
      lines.push("| flag        | cost Δ   | wall Δ   | pass Δ |");
      lines.push("|-------------|----------|----------|--------|");
      for (const d of report.deltas) {
        const costPct = `${d.costDeltaPct >= 0 ? "+" : ""}${d.costDeltaPct.toFixed(1)}%`;
        const wallPct = `${d.wallDeltaPct >= 0 ? "+" : ""}${d.wallDeltaPct.toFixed(1)}%`;
        const passDelta = `${d.passRateDelta >= 0 ? "+" : ""}${(d.passRateDelta * 100).toFixed(1)}pp`;
        lines.push(`| ${d.flagLabel.padEnd(11)} | ${costPct.padStart(8)} | ${wallPct.padStart(8)} | ${passDelta.padStart(6)} |`);
      }
    }
  }
  return lines.join("\n");
}

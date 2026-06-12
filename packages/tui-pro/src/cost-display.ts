/**
 * v0.5.0 cost display utilities.
 *
 * - `CostTracker`: accumulates session cost + cache stats, exposes a
 *   `formatStatusLine()` method for the TUI footer.
 * - `formatStatusLine(opts)`: pure formatter for one-shot use.
 *
 * Wired into the LLM worker via `LlmWorker.getCostTracker()`.
 */

export interface CostTrackerState {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  cacheHits: number;
  cacheMisses: number;
  cacheReads: number;
  cacheWrites: number;
  elapsedMs: number;
  /** epoch ms when the tracker was created. */
  startedAt: number;
}

export class CostTracker {
  private state: CostTrackerState;

  constructor() {
    this.state = {
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheReads: 0,
      cacheWrites: 0,
      elapsedMs: 0,
      startedAt: Date.now(),
    };
  }

  recordUsage(usage: { in: number; out: number; cacheReadTokens?: number; cacheWriteTokens?: number; costUsd?: number }): void {
    this.state.tokensIn += usage.in;
    this.state.tokensOut += usage.out;
    if (usage.cacheReadTokens) {
      this.state.cacheReads += usage.cacheReadTokens;
      this.state.cacheHits++;
    }
    if (usage.cacheWriteTokens) {
      this.state.cacheWrites += usage.cacheWriteTokens;
      this.state.cacheMisses++;
    }
    if (usage.costUsd) this.state.costUsd += usage.costUsd;
  }

  recordCacheHit(): void {
    this.state.cacheHits++;
  }

  tick(): void {
    this.state.elapsedMs = Date.now() - this.state.startedAt;
  }

  getState(): CostTrackerState {
    this.tick();
    return { ...this.state };
  }

  getCacheHitRate(): number {
    const total = this.state.cacheHits + this.state.cacheMisses;
    return total === 0 ? 0 : this.state.cacheHits / total;
  }

  /** Format as a single-line status string for TUI footers. */
  formatStatusLine(opts: { charsPerToken?: number } = {}): string {
    const s = this.getState();
    const cachePct = Math.round(this.getCacheHitRate() * 100);
    const costStr = s.costUsd < 0.01 ? `$${s.costUsd.toFixed(4)}` : `$${s.costUsd.toFixed(2)}`;
    const elapsedStr = formatElapsed(s.elapsedMs);
    return `tok:${s.tokensIn}↗/${s.tokensOut}↘  ${costStr}  cache:${cachePct}%  ${elapsedStr}`;
  }
}

export interface FormatStatusLineOpts {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  cacheHits: number;
  cacheMisses: number;
  elapsedMs: number;
}

export function formatStatusLine(opts: FormatStatusLineOpts): string {
  const total = opts.cacheHits + opts.cacheMisses;
  const cachePct = total === 0 ? 0 : Math.round((opts.cacheHits / total) * 100);
  const costStr = opts.costUsd < 0.01 ? `$${opts.costUsd.toFixed(4)}` : `$${opts.costUsd.toFixed(2)}`;
  return `tok:${opts.tokensIn}↗/${opts.tokensOut}↘  ${costStr}  cache:${cachePct}%  ${formatElapsed(opts.elapsedMs)}`;
}

export interface CostBreakdownOpts {
  /** Total cost in USD. */
  totalUsd: number;
  /** Optional: cost per category (input, output, cache read, cache write). */
  byCategory?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  /** Optional: per-task costs. */
  perTask?: Array<{ taskId: string; costUsd: number; tokensIn: number; tokensOut: number }>;
}

/**
 * Format a per-category cost breakdown for the `/cost` slash command.
 */
export function formatCostBreakdown(opts: CostBreakdownOpts): string {
  const lines: string[] = [];
  lines.push(`## Cost breakdown`);
  lines.push("");
  lines.push(`Total: $${opts.totalUsd.toFixed(4)}`);
  if (opts.byCategory) {
    lines.push("");
    lines.push(`By category:`);
    lines.push(`  input       $${opts.byCategory.input.toFixed(4)}`);
    lines.push(`  output      $${opts.byCategory.output.toFixed(4)}`);
    lines.push(`  cache read  $${opts.byCategory.cacheRead.toFixed(4)}`);
    lines.push(`  cache write $${opts.byCategory.cacheWrite.toFixed(4)}`);
  }
  if (opts.perTask && opts.perTask.length > 0) {
    lines.push("");
    lines.push(`Per task:`);
    for (const t of opts.perTask) {
      lines.push(`  ${t.taskId}: $${t.costUsd.toFixed(4)} (${t.tokensIn}↗/${t.tokensOut}↘)`);
    }
  }
  return lines.join("\n");
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

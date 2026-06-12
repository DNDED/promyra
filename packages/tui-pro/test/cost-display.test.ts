import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CostTracker, formatStatusLine, formatCostBreakdown } from "../src/cost-display.js";

describe("CostTracker", () => {
  let tracker: CostTracker;
  beforeEach(() => { tracker = new CostTracker(); });

  it("starts at zero", () => {
    const s = tracker.getState();
    expect(s.tokensIn).toBe(0);
    expect(s.tokensOut).toBe(0);
    expect(s.costUsd).toBe(0);
    expect(s.cacheHits).toBe(0);
  });

  it("accumulates usage", () => {
    tracker.recordUsage({ in: 100, out: 50, costUsd: 0.01 });
    tracker.recordUsage({ in: 200, out: 100, costUsd: 0.02 });
    const s = tracker.getState();
    expect(s.tokensIn).toBe(300);
    expect(s.tokensOut).toBe(150);
    expect(s.costUsd).toBeCloseTo(0.03, 4);
  });

  it("tracks cache reads and writes", () => {
    tracker.recordUsage({ in: 100, out: 50, cacheReadTokens: 80, cacheWriteTokens: 20 });
    const s = tracker.getState();
    expect(s.cacheReads).toBe(80);
    expect(s.cacheWrites).toBe(20);
    expect(s.cacheMisses).toBe(1);
  });

  it("records cache hits", () => {
    tracker.recordCacheHit();
    tracker.recordCacheHit();
    expect(tracker.getCacheHitRate()).toBe(1);
    tracker.recordCacheHit();
    expect(tracker.getCacheHitRate()).toBe(1);
  });

  it("computes cache hit rate", () => {
    tracker.recordCacheHit();
    tracker.recordCacheHit();
    tracker.recordUsage({ in: 100, out: 50, cacheWriteTokens: 20 }); // miss
    expect(tracker.getCacheHitRate()).toBeCloseTo(2 / 3, 2);
  });

  it("formats status line with all fields", async () => {
    // First call: cache miss (writes 20 to cache)
    tracker.recordUsage({ in: 1500, out: 380, costUsd: 0.012, cacheWriteTokens: 20 });
    // Second call: cache hit (reads 1100 from cache)
    tracker.recordUsage({ in: 1500, out: 380, costUsd: 0.001, cacheReadTokens: 1100 });
    await new Promise(r => setTimeout(r, 10));
    const line = tracker.formatStatusLine();
    expect(line).toContain("tok:3000↗/760↘");
    expect(line).toContain("$0.01");
    expect(line).toContain("cache:50%");
  });

  it("formats status line with zero cost", () => {
    const line = tracker.formatStatusLine();
    expect(line).toContain("$0.0000");
    expect(line).toContain("cache:0%");
  });
});

describe("formatStatusLine (pure)", () => {
  it("formats inputs correctly", () => {
    const line = formatStatusLine({
      tokensIn: 1000, tokensOut: 200, costUsd: 0.005,
      cacheHits: 5, cacheMisses: 5, elapsedMs: 30_000,
    });
    expect(line).toContain("1000↗");
    expect(line).toContain("200↘");
    expect(line).toContain("cache:50%");
    expect(line).toContain("30s");
  });

  it("handles no cache activity", () => {
    const line = formatStatusLine({
      tokensIn: 0, tokensOut: 0, costUsd: 0,
      cacheHits: 0, cacheMisses: 0, elapsedMs: 0,
    });
    expect(line).toContain("cache:0%");
    expect(line).toContain("0ms");
  });
});

describe("formatCostBreakdown", () => {
  it("renders total + categories", () => {
    const out = formatCostBreakdown({
      totalUsd: 0.1234,
      byCategory: { input: 0.05, output: 0.06, cacheRead: 0.003, cacheWrite: 0.01 },
    });
    expect(out).toContain("Total: $0.1234");
    expect(out).toContain("input       $0.0500");
    expect(out).toContain("cache read  $0.0030");
  });

  it("renders per-task breakdown", () => {
    const out = formatCostBreakdown({
      totalUsd: 0.10,
      perTask: [
        { taskId: "tsk_1", costUsd: 0.04, tokensIn: 500, tokensOut: 100 },
        { taskId: "tsk_2", costUsd: 0.06, tokensIn: 800, tokensOut: 150 },
      ],
    });
    expect(out).toContain("tsk_1: $0.0400");
    expect(out).toContain("tsk_2: $0.0600");
  });

  it("omits per-task when not provided", () => {
    const out = formatCostBreakdown({ totalUsd: 0.01 });
    expect(out).not.toContain("Per task:");
  });
});

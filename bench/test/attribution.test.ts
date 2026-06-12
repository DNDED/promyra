import { describe, it, expect } from "vitest";
import { FLAG_CONFIGS, formatAttribution, type AttributionReport } from "../src/attribution.js";

describe("FLAG_CONFIGS", () => {
  it("has all-on with all flags true", () => {
    const cfg = FLAG_CONFIGS["all-on"];
    expect(cfg.flags.cache).toBe(true);
    expect(cfg.flags.repoMap).toBe(true);
    expect(cfg.flags.cascade).toBe(true);
    expect(cfg.flags.parallelTools).toBe(true);
    expect(cfg.flags.telemetry).toBe(true);
  });

  it("has all-off with all flags false", () => {
    const cfg = FLAG_CONFIGS["all-off"];
    expect(cfg.flags.cache).toBe(false);
    expect(cfg.flags.repoMap).toBe(false);
    expect(cfg.flags.cascade).toBe(false);
    expect(cfg.flags.parallelTools).toBe(false);
    expect(cfg.flags.telemetry).toBe(false);
  });

  it("has targeted configs that disable one technique each", () => {
    expect(FLAG_CONFIGS["cache-off"].flags.cache).toBe(false);
    expect(FLAG_CONFIGS["cache-off"].flags.cascade).toBe(true);
    expect(FLAG_CONFIGS["cascade-off"].flags.cascade).toBe(false);
    expect(FLAG_CONFIGS["cascade-off"].flags.cache).toBe(true);
    expect(FLAG_CONFIGS["parallel-off"].flags.parallelTools).toBe(false);
    expect(FLAG_CONFIGS["parallel-off"].flags.cache).toBe(true);
    expect(FLAG_CONFIGS["repomap-off"].flags.repoMap).toBe(false);
    expect(FLAG_CONFIGS["repomap-off"].flags.cache).toBe(true);
  });
});

describe("formatAttribution", () => {
  it("formats a report as a markdown table", () => {
    const report: AttributionReport = {
      rows: [
        { flagLabel: "all-on", totalCostUsd: 0.012, avgWallMs: 18_000, totalTokensIn: 5000, totalTokensOut: 1000, passRate: 1, passCount: 5, totalCount: 5, skipCount: 0, results: [] },
        { flagLabel: "all-off", totalCostUsd: 0.030, avgWallMs: 30_000, totalTokensIn: 12_000, totalTokensOut: 2500, passRate: 0.8, passCount: 4, totalCount: 5, skipCount: 0, results: [] },
      ],
      deltas: [
        { flagLabel: "all-on", costDelta: 0, costDeltaPct: 0, wallDelta: 0, wallDeltaPct: 0, passRateDelta: 0 },
        { flagLabel: "all-off", costDelta: 0.018, costDeltaPct: 150, wallDelta: 12_000, wallDeltaPct: 66.7, passRateDelta: -0.2 },
      ],
    };
    const out = formatAttribution(report);
    expect(out).toContain("| flag        | cost    | wall/avg | pass rate |");
    expect(out).toContain("all-on");
    expect(out).toContain("$0.0120");
    expect(out).toContain("5/5");
    expect(out).toContain("Delta vs all-on");
    expect(out).toContain("+150.0%");
  });

  it("handles empty deltas gracefully", () => {
    const report: AttributionReport = {
      rows: [
        { flagLabel: "all-on", totalCostUsd: 0, avgWallMs: 0, totalTokensIn: 0, totalTokensOut: 0, passRate: 0, passCount: 0, totalCount: 0, skipCount: 0, results: [] },
      ],
      deltas: [
        { flagLabel: "all-on", costDelta: 0, costDeltaPct: 0, wallDelta: 0, wallDeltaPct: 0, passRateDelta: 0 },
      ],
    };
    const out = formatAttribution(report);
    expect(out).toContain("all-on");
  });
});

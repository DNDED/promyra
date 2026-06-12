/**
 * v0.5.0 PROMYRA_* environment flags.
 *
 * Per spec §5:
 *   PROMYRA_CACHE=0          # disable prompt cache
 *   PROMYRA_REPO_MAP=0       # disable repo map (block + tool)
 *   PROMYRA_CASCADE=0        # disable cascade routing
 *   PROMYRA_PARALLEL_TOOLS=0 # disable parallel tool execution
 *   PROMYRA_TELEMETRY=0      # disable cost telemetry
 *
 * All default ON (set to "0", "false", or "no" to disable).
 */

import type { OptimizerFlags } from "@promyra/optimizer";

function envFlag(name: string): boolean {
  const v = process.env[name];
  if (v === undefined) return true; // default ON
  const s = v.toLowerCase().trim();
  return !(s === "0" || s === "false" || s === "no" || s === "off");
}

/**
 * Read PROMYRA_* env vars into OptimizerFlags. Each flag defaults to
 * `true` (on). Set the env var to "0", "false", "no", or "off" to
 * disable.
 */
export function readFlagsFromEnv(): Required<OptimizerFlags> {
  return {
    cache: envFlag("PROMYRA_CACHE"),
    repoMap: envFlag("PROMYRA_REPO_MAP"),
    cascade: envFlag("PROMYRA_CASCADE"),
    parallelTools: envFlag("PROMYRA_PARALLEL_TOOLS"),
    telemetry: envFlag("PROMYRA_TELEMETRY"),
  };
}

/**
 * Returns a formatted status line showing which flags are enabled.
 * Useful for `--check` and the `doctor` command.
 */
export function formatFlagsStatus(flags: Required<OptimizerFlags>): string {
  const items: Array<[string, boolean]> = [
    ["cache", flags.cache],
    ["repoMap", flags.repoMap],
    ["cascade", flags.cascade],
    ["parallelTools", flags.parallelTools],
    ["telemetry", flags.telemetry],
  ];
  return items.map(([k, on]) => `${k}: ${on ? "ON" : "off"}`).join("  ");
}

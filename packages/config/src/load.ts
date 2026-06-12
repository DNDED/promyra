import { existsSync, readFileSync } from "node:fs";
import { DEFAULT_CONFIG } from "./defaults.js";
import { validateConfig } from "./types.js";
import { getConfigPath } from "./paths.js";
import type { PiConfig } from "./types.js";

export function loadConfig(path?: string): PiConfig {
  const p = path ?? getConfigPath();
  if (!existsSync(p)) return structuredClone(DEFAULT_CONFIG);
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const result = validateConfig(raw);
    if (result.ok) return result.config;
    return structuredClone(DEFAULT_CONFIG);
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

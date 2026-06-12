import type { PiConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./defaults.js";

export function mergeConfig(base: PiConfig, override: Partial<PiConfig>): PiConfig {
  const merged: PiConfig = {
    ...base,
    ...override,
    provider: { ...base.provider, ...(override.provider ?? {}) },
    agent: { ...base.agent, ...(override.agent ?? {}) },
    theme: { ...base.theme, ...(override.theme ?? {}) },
    ui: { ...(base.ui ?? DEFAULT_CONFIG.ui), ...(override.ui ?? {}) },
    modes: override.modes ?? base.modes,
  };
  return merged;
}

export function applyEnvOverrides(base: PiConfig, env: Record<string, string | undefined>): PiConfig {
  let out = base;
  const model = env.PI_MODEL;
  if (model) out = { ...out, provider: { ...out.provider, model } };
  const agent = env.PI_AGENT;
  if (agent) out = { ...out, agent: { ...out.agent, name: agent } };
  const baseUrl = env.PI_BASE_URL;
  if (baseUrl !== undefined) {
    out = { ...out, provider: { ...out.provider, baseUrl: baseUrl || undefined } };
  }
  return out;
}

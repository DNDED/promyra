import { existsSync, readFileSync } from "node:fs";
import { loadConfig, saveConfig, setApiKey, getApiKey, setProvider, setModel, defaultModelFor } from "@pi/provider";
import { PI_CONFIG_PATH, PI_AUTH_PATH } from "../config-paths.js";

function maskKey(k: string): string {
  if (k.length <= 8) return "****";
  return `${k.slice(0, 4)}...${k.slice(-4)}`;
}

export async function config(action?: string, key?: string, value?: string): Promise<void> {
  if (!action) {
    const cfg = await loadConfig(PI_CONFIG_PATH);
    console.log("pi config");
    console.log("─".repeat(40));
    console.log(`  provider: ${cfg.provider}`);
    console.log(`  model:    ${cfg.model}`);
    if (cfg.baseUrl) console.log(`  baseUrl:  ${cfg.baseUrl}`);
    console.log();
    console.log(`  config: ${PI_CONFIG_PATH} ${existsSync(PI_CONFIG_PATH) ? "" : "(default — not yet saved)"}`);
    console.log(`  auth:   ${PI_AUTH_PATH} ${existsSync(PI_AUTH_PATH) ? "" : "(no key set)"}`);
    const k = await getApiKey(cfg.provider, PI_AUTH_PATH);
    if (k) console.log(`  key:    ${maskKey(k)}`);
    return;
  }

  if (action === "set") {
    if (!key) {
      console.error("usage: pi config set <key> <value>");
      console.error("  e.g. pi config set model minimax-m3");
      console.error("  e.g. pi config set baseUrl ''   (empty clears the value)");
      process.exit(1);
    }
    if (key === "model") {
      if (!value) { console.error("model requires a value"); process.exit(1); }
      await setModel(value, PI_CONFIG_PATH);
    } else if (key === "provider") {
      if (!value) { console.error("provider requires a value"); process.exit(1); }
      await setProvider(value as never, PI_CONFIG_PATH);
    } else if (key === "baseUrl") {
      const cfg = await loadConfig(PI_CONFIG_PATH);
      if (value === "" || value === "null" || value === "none") {
        delete cfg.baseUrl;
        await saveConfig(cfg, PI_CONFIG_PATH);
        console.log(`  cleared baseUrl`);
        return;
      }
      cfg.baseUrl = value;
      await saveConfig(cfg, PI_CONFIG_PATH);
    } else {
      console.error(`unknown key: ${key}`);
      process.exit(1);
    }
    console.log(`  set ${key} = ${value}`);
    return;
  }

  if (action === "set-key") {
    if (!key || !value) {
      console.error("usage: pi config set-key <provider> <key>");
      process.exit(1);
    }
    await setApiKey(key as never, value, PI_AUTH_PATH);
    console.log(`  key set for ${key}`);
    return;
  }

  if (action === "default-model") {
    if (!key) {
      console.error("usage: pi config default-model <provider>");
      process.exit(1);
    }
    const m = defaultModelFor(key as never);
    console.log(`  ${key} default: ${m}`);
    return;
  }

  console.error(`unknown action: ${action}`);
  console.error("actions: set, set-key, default-model");
  process.exit(1);
}

import { loadConfig, getApiKey, saveConfig, setApiKey, setModel, setProvider, getApiKey as _getApiKey, defaultModelFor, isAnthropicModel } from "@pi/provider";
import { PI_CONFIG_PATH, PI_AUTH_PATH, piHome } from "../config-paths.js";
import { existsSync, writeFileSync, mkdirSync, chmodSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import * as readline from "node:readline";
import { execSync } from "node:child_process";

const PI_VERSION = "0.3.0";
const KNOWN_PROVIDERS = ["opencode-go", "anthropic", "openai", "ollama", "openrouter"] as const;
type ProviderName = (typeof KNOWN_PROVIDERS)[number];

function envVarFor(provider: string): string {
  switch (provider) {
    case "opencode-go": return "OPENCODE_GO_API_KEY";
    case "anthropic": return "ANTHROPIC_API_KEY";
    case "openai": return "OPENAI_API_KEY";
    case "ollama": return "OLLAMA_API_KEY";
    case "openrouter": return "OPENROUTER_API_KEY";
    default: return `${provider.toUpperCase()}_API_KEY`;
  }
}

function mask(k: string): string {
  if (k.length <= 8) return "****";
  return `${k.slice(0, 4)}...${k.slice(-4)}`;
}

async function prompt(rl: readline.Interface, question: string, defaultVal?: string): Promise<string> {
  return new Promise((resolve) => {
    const suffix = defaultVal ? ` [${defaultVal}]` : "";
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

async function writeConfig(cfg: { provider: string; model: string; baseUrl?: string }): Promise<void> {
  mkdirSync(dirname(PI_CONFIG_PATH), { recursive: true });
  const json = JSON.stringify(cfg, null, 2) + "\n";
  writeFileSync(PI_CONFIG_PATH, json, { mode: 0o600 });
  try { chmodSync(PI_CONFIG_PATH, 0o600); } catch { /* ignore on some fs */ }
}

async function writeAuth(provider: string, key: string): Promise<void> {
  mkdirSync(dirname(PI_AUTH_PATH), { recursive: true });
  let all: Record<string, string> = {};
  if (existsSync(PI_AUTH_PATH)) {
    all = JSON.parse(readFileSync(PI_AUTH_PATH, "utf8"));
  }
  all[provider] = key;
  const json = JSON.stringify(all, null, 2) + "\n";
  writeFileSync(PI_AUTH_PATH, json, { mode: 0o600 });
  try { chmodSync(PI_AUTH_PATH, 0o600); } catch { /* ignore */ }
}

export interface SetupOpts {
  nonInteractive?: boolean;
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export async function setup(opts: SetupOpts = {}): Promise<void> {
  const banner = [
    "    ____  _",
    "   |  _ \\(_)___  ___",
    "   | |_) || |/ _ \\/ __|",
    "   |  __/ | | (_) \\__ \\",
    "   |_|    |_|\\___/|___/",
    "",
    `   coding agent · v${PI_VERSION}`,
    "",
  ].join("\n");

  console.log(banner);
  console.log(`  config: ${PI_CONFIG_PATH}`);
  console.log(`  auth:   ${PI_AUTH_PATH}`);
  console.log("");

  let cfg = await loadConfig(PI_CONFIG_PATH).catch(() => null);

  if (cfg && !opts.nonInteractive) {
    console.log(`  current provider: ${cfg.provider}`);
    console.log(`  current model:    ${cfg.model}`);
    if (cfg.baseUrl) console.log(`  current baseUrl:   ${cfg.baseUrl}`);
    console.log();
  }

  let provider: ProviderName = (opts.provider ?? cfg?.provider ?? "opencode-go") as ProviderName;
  let model = opts.model ?? cfg?.model ?? defaultModelFor(provider);
  let baseUrl: string | undefined = opts.baseUrl ?? cfg?.baseUrl;
  let apiKey: string | undefined = opts.apiKey;

  if (opts.nonInteractive) {
    if (!apiKey) apiKey = process.env[envVarFor(provider)];
    if (!apiKey) {
      const envVar = envVarFor(provider);
      console.error(`✗ no API key for ${provider}.`);
      console.error(`  set env var: ${envVar}=<key>`);
      console.error(`  or run: pi setup --api-key <key> --provider ${provider}`);
      process.exit(1);
    }
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const providerInput = await prompt(rl, "Provider (opencode-go/anthropic/openai/ollama/openrouter)", provider);
      if (KNOWN_PROVIDERS.includes(providerInput as ProviderName)) {
        provider = providerInput as ProviderName;
        model = defaultModelFor(provider);
      } else if (providerInput) {
        console.log(`  ! unknown provider "${providerInput}", keeping ${provider}`);
      }

      const modelInput = await prompt(rl, `Model for ${provider}`, model);
      if (modelInput) model = modelInput;

      const baseUrlInput = await prompt(rl, "Base URL (blank for default)", baseUrl ?? "");
      baseUrl = baseUrlInput || undefined;

      if (!apiKey) {
        const envVar = envVarFor(provider);
        const envKey = process.env[envVar];
        if (envKey) {
          console.log(`  ✓ found ${envVar} in environment`);
          apiKey = envKey;
        } else {
          apiKey = await prompt(rl, `API key for ${provider} (or set ${envVar} env var)`);
          if (!apiKey) {
            console.error(`✗ no API key provided. set ${envVar} or re-run with --api-key`);
            process.exit(1);
          }
        }
      }
    } finally {
      rl.close();
    }
  }

  console.log();
  console.log("  writing config...");
  await writeConfig({ provider, model, baseUrl });

  console.log("  writing auth...");
  if (apiKey) await writeAuth(provider, apiKey);

  console.log();
  console.log("  ✓ setup complete");
  console.log();
  console.log(`  provider: ${provider}`);
  console.log(`  model:    ${model}`);
  if (apiKey) console.log(`  api key:  ${mask(apiKey)}`);
  if (baseUrl) console.log(`  baseUrl:  ${baseUrl}`);
  console.log();
  console.log(`  try: pi "add a /healthz endpoint that returns HTTP 200"`);
  console.log(`  or:   pi --pipeline "fix the auth bug"`);
  console.log(`  or:   pi multica jorvis "research the codebase"`);
}

export async function interactive(): Promise<void> {
  // Bare `pi` invocation: launch an interactive session
  const cfg = await loadConfig(PI_CONFIG_PATH).catch(() => null);
  const hasKey = cfg ? !!(await _getApiKey(cfg.provider, PI_AUTH_PATH)) : false;

  console.log(`pi v${PI_VERSION} — interactive`);
  console.log("─".repeat(40));

  if (!cfg || !hasKey) {
    console.log();
    if (!cfg) console.log("  ! no config found at " + PI_CONFIG_PATH);
    if (!hasKey) console.log("  ! no API key for " + (cfg?.provider ?? "opencode-go"));
    console.log();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await prompt(rl, "Run setup now? (Y/n)", "Y");
      if (answer.toLowerCase() === "y" || answer === "") {
        await setup();
        rl.close();
        return;
      } else {
        console.log("  run `pi setup` later to configure.");
        rl.close();
        process.exit(1);
      }
    } finally {
      rl.close();
    }
  }

  console.log(`  config:    ${cfg!.provider} / ${cfg!.model}`);
  if (cfg!.baseUrl) console.log(`  baseUrl:   ${cfg!.baseUrl}`);
  const key = await _getApiKey(cfg!.provider, PI_AUTH_PATH);
  console.log(`  api key:   ${key ? mask(key) : "(not set)"}`);
  console.log(`  workdir:   ${process.cwd()}`);
  console.log();
  console.log("  commands:");
  console.log("    :run <task>        run a task");
  console.log("    :pipeline <task>   5-stage pipeline");
  console.log("    :swarm <goal>      6-agent swarm");
  console.log("    :multica <n> <t>   named agent");
  console.log("    :doctor            check system");
  console.log("    :config            show config");
  console.log("    :help              this menu");
  console.log("    :quit              exit");
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "pi> " });
  rl.prompt();

  await new Promise<void>((resolve) => {
    rl.on("line", async (line) => {
      const cmd = line.trim();
      if (!cmd) {
        rl.prompt();
        return;
      }
      try {
        if (cmd === ":quit" || cmd === ":q" || cmd === ":exit") {
          rl.close();
          resolve();
          return;
        }
        if (cmd === ":help" || cmd === ":h") {
          console.log("  :run <task>      run a task");
          console.log("  :pipeline <t>    5-stage pipeline");
          console.log("  :swarm <goal>     6-agent swarm");
          console.log("  :multica <n> <t>  named agent (jorvis/jouono/scout/summit/quill/surge/cipher/forge)");
          console.log("  :doctor           check system");
          console.log("  :config           show config");
          console.log("  :bench            run eval bench");
          console.log("  :search <q>       single researcher");
          console.log("  :audit            security + code review");
          console.log("  :review           code review");
          console.log("  :help             this menu");
          console.log("  :quit             exit");
        } else if (cmd === ":doctor") {
          const { doctor } = await import("./doctor.js");
          await doctor();
        } else if (cmd === ":config") {
          const { config } = await import("./config.js");
          await config();
        } else if (cmd === ":bench") {
          const { benchCommand } = await import("./bench.js");
          await benchCommand({});
        } else if (cmd.startsWith(":run ")) {
          const task = cmd.slice(5);
          const { start } = await import("./start.js");
          await start(task);
        } else if (cmd.startsWith(":pipeline ")) {
          const task = cmd.slice(10);
          const { pipeline } = await import("./pipeline.js");
          await pipeline(task);
        } else if (cmd.startsWith(":swarm ")) {
          const goal = cmd.slice(7);
          const { swarmGoal } = await import("./swarm.js");
          await swarmGoal(goal, process.cwd());
        } else if (cmd.startsWith(":multica ")) {
          const rest = cmd.slice(9);
          const spaceIdx = rest.indexOf(" ");
          if (spaceIdx === -1) {
            console.log("  usage: :multica <name> <task>");
          } else {
            const name = rest.slice(0, spaceIdx);
            const task = rest.slice(spaceIdx + 1);
            const { multicaSwarm } = await import("./swarm.js");
            await multicaSwarm(name, task);
          }
        } else if (cmd.startsWith(":search ")) {
          const query = cmd.slice(8);
          const { swarmSearch } = await import("./swarm.js");
          await swarmSearch(query);
        } else if (cmd === ":audit") {
          const { swarmAudit } = await import("./swarm.js");
          await swarmAudit();
        } else if (cmd === ":review") {
          const { swarmReview } = await import("./swarm.js");
          await swarmReview();
        } else {
          // Treat as bare task
          const { start } = await import("./start.js");
          await start(cmd);
        }
      } catch (e) {
        console.error(`  ✗ ${(e as Error).message}`);
      }
      console.log();
      rl.prompt();
    });
    rl.on("close", () => resolve());
  });
}

import { loadConfig, getApiKey } from "@pi/provider";
import { PI_CONFIG_PATH, PI_AUTH_PATH, piHome } from "../config-paths.js";
import { SubagentRouter } from "@pi/subagent";
import { createProvider, loadConfig as _loadConfig, getApiKey as _getApiKey } from "@pi/provider";
import { isAnthropicModel } from "@pi/provider";
import { existsSync, accessSync } from "node:fs";
import { execSync } from "node:child_process";

const PI_VERSION = "0.3.0";

function which(cmd: string): boolean {
  if (cmd === "node") {
    return typeof process !== "undefined" && typeof process.version === "string";
  }
  // Try several common paths explicitly so subprocess PATH issues don't hide tools
  const candidates = cmd === "git" ? ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"] : [];
  for (const c of candidates) {
    try {
      accessSync(c);
      return true;
    } catch { /* not here */ }
  }
  try {
    const result = execSync(`command -v ${cmd} 2>/dev/null || which ${cmd} 2>/dev/null || ls /usr/bin/${cmd} /usr/local/bin/${cmd} 2>/dev/null`, {
      stdio: "pipe",
      env: { ...process.env, PATH: (process.env.PATH ?? "") + ":/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin" },
    }).toString().trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

function gitInfo(dir: string): string {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD 2>/dev/null", { cwd: dir, stdio: "pipe" }).toString().trim();
    const status = execSync("git status --short 2>/dev/null", { cwd: dir, stdio: "pipe" }).toString().trim();
    return `branch: ${branch}${status ? " (dirty)" : " (clean)"}`;
  } catch {
    return "not a git repo";
  }
}

function nodeInfo(): string {
  try {
    const v = process.version;
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    return `node ${v} (${mem}MB)`;
  } catch {
    return "node ?";
  }
}

async function buildSmokeTest(): Promise<{ ok: boolean; msg: string }> {
  try {
    const cfg = await _loadConfig(PI_CONFIG_PATH).catch(() => null);
    if (!cfg) return { ok: false, msg: "config not loadable" };
    const key = await _getApiKey(cfg.provider, PI_AUTH_PATH);
    if (!key) return { ok: false, msg: "no api key for build smoke test" };

    const provider = createProvider({ apiKey: key, baseUrl: cfg.baseUrl, defaultModel: cfg.model });
    const router = SubagentRouter.withProvider(provider, process.cwd(), cfg.model);
    const taskId = `tsk_smoke_${Date.now().toString(16).slice(0, 8)}`;
    const r = await router.dispatch("build", {
      taskId, stepId: "smoke", description: "echo: return {\"status\":\"pass\",\"evidence\":\"smoke test ok\"}", worktreePath: process.cwd(),
    });
    if (r.status === "pass") return { ok: true, msg: `${r.tokensIn}↗ ${r.tokensOut}↘` };
    return { ok: false, msg: `smoke test returned: ${r.status}` };
  } catch (e) {
    return { ok: false, msg: (e as Error).message.slice(0, 50) };
  }
}

async function pipelineSmokeTest(): Promise<{ ok: boolean; msg: string }> {
  try {
    const { PipelineWorker } = await import("@pi/subagent");
    const { createBashTool, createReadTool, createGrepTool, createGlobTool } = await import("@pi/tools");
    const cfg = await _loadConfig(PI_CONFIG_PATH).catch(() => null);
    if (!cfg) return { ok: false, msg: "config not loadable" };
    const key = await _getApiKey(cfg.provider, PI_AUTH_PATH);
    if (!key) return { ok: false, msg: "no api key for pipeline smoke test" };
    const provider = createProvider({ apiKey: key, baseUrl: cfg.baseUrl, defaultModel: cfg.model });
    const tools = [
      createBashTool({ cwd: process.cwd() }),
      createReadTool({ cwd: process.cwd() }),
      createGrepTool({ cwd: process.cwd() }),
      createGlobTool({ cwd: process.cwd() }),
    ];
    const worker = PipelineWorker.default(provider, tools as never, process.cwd(), {}, { maxRefineLoops: 1 });
    const r = await worker.run({ taskId: "tsk_smoke_pipe", stepId: "smoke", description: "echo: return {\"status\":\"pass\"}", worktreePath: process.cwd() });
    if (r.status === "pass") return { ok: true, msg: `${r.stages.length} stages · ${r.tokensIn}↗ ${r.tokensOut}↘` };
    return { ok: false, msg: `pipeline returned: ${r.status}` };
  } catch (e) {
    return { ok: false, msg: (e as Error).message.slice(0, 50) };
  }
}

async function swarmSmokeTest(): Promise<{ ok: boolean; msg: string }> {
  try {
    const { SubagentRouter } = await import("@pi/subagent");
    const cfg = await _loadConfig(PI_CONFIG_PATH).catch(() => null);
    if (!cfg) return { ok: false, msg: "config not loadable" };
    const key = await _getApiKey(cfg.provider, PI_AUTH_PATH);
    if (!key) return { ok: false, msg: "no api key for swarm smoke test" };
    const provider = createProvider({ apiKey: key, baseUrl: cfg.baseUrl, defaultModel: cfg.model });
    const router = SubagentRouter.withProvider(provider, process.cwd(), cfg.model);
    const r = await router.dispatch("researcher", {
      taskId: "tsk_smoke_swarm", stepId: "smoke", description: "echo: return {\"status\":\"pass\"}", worktreePath: process.cwd(),
    });
    if (r.status === "pass") return { ok: true, msg: `researcher agent · ${r.tokensIn}↗ ${r.tokensOut}↘` };
    return { ok: false, msg: `swarm returned: ${r.status}` };
  } catch (e) {
    return { ok: false, msg: (e as Error).message.slice(0, 50) };
  }
}

export async function doctor(): Promise<void> {
  const cwd = process.cwd();
  const home = piHome();
  const rows: Array<[string, string, "ok" | "warn" | "fail"]> = [];

  rows.push(["pi", `v${PI_VERSION}`, "ok"]);
  rows.push(["node", nodeInfo(), which("node") ? "ok" : "fail"]);
  rows.push(["git", which("git") ? "installed" : "missing", which("git") ? "ok" : "fail"]);
  rows.push(["gh", which("gh") ? "installed" : "missing (PR creation disabled)", which("gh") ? "ok" : "warn"]);
  rows.push(["cwd", cwd, "ok"]);
  rows.push(["git status", gitInfo(cwd), "ok"]);
  rows.push(["config", existsSync(PI_CONFIG_PATH) ? PI_CONFIG_PATH : `${PI_CONFIG_PATH} (not found — using defaults)`, existsSync(PI_CONFIG_PATH) ? "ok" : "warn"]);
  rows.push(["auth", existsSync(PI_AUTH_PATH) ? PI_AUTH_PATH : `${PI_AUTH_PATH} (not found)`, existsSync(PI_AUTH_PATH) ? "ok" : "warn"]);
  rows.push(["home", home, "ok"]);

  // Capability matrix
  let cfg: Awaited<ReturnType<typeof loadConfig>> | null = null;
  try {
    cfg = await loadConfig(PI_CONFIG_PATH);
  } catch {}
  if (cfg) {
    const routerKind = isAnthropicModel(cfg.model) ? "Anthropic-format (OpenCode Go)" : "OpenAI-format";
    rows.push(["model router", `${cfg.model} → ${routerKind}`, "ok"]);
  }

  console.log(`pi doctor (v${PI_VERSION})`);
  console.log("─".repeat(50));
  for (const [k, v, status] of rows) {
    const tag = status === "ok" ? "✓" : status === "warn" ? "!" : "✗";
    console.log(`  ${tag} ${k.padEnd(16)} ${v}`);
  }

  console.log();
  console.log("  capability smoke tests...");
  const buildSmoke = await buildSmokeTest();
  console.log(`  ${buildSmoke.ok ? "✓" : "✗"} build (single subagent)         ${buildSmoke.msg}`);
  const pipelineSmoke = await pipelineSmokeTest();
  console.log(`  ${pipelineSmoke.ok ? "✓" : "✗"} pipeline (5-stage)              ${pipelineSmoke.msg}`);
  const swarmSmoke = await swarmSmokeTest();
  console.log(`  ${swarmSmoke.ok ? "✓" : "✗"} swarm (researcher)              ${swarmSmoke.msg}`);

  const fail = rows.filter((r) => r[2] === "fail").length +
    (buildSmoke.ok ? 0 : 1) + (pipelineSmoke.ok ? 0 : 1) + (swarmSmoke.ok ? 0 : 1);
  const warn = rows.filter((r) => r[2] === "warn").length;
  console.log();
  if (fail > 0) console.log(`  ✗ ${fail} failure(s)`);
  else if (warn > 0) console.log(`  ! ${warn} warning(s)`);
  else console.log("  ✓ all systems go");
}

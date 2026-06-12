const PI_VERSION = "0.3.0";

function showHelp(): void {
  console.log(`pi v${PI_VERSION}`);
  console.log("");
  console.log("usage:");
  console.log("  pi                          interactive session (REPL)");
  console.log("  pi \"<task>\"                 run a coding task (single build subagent)");
  console.log("  pi --pipeline \"<task>\"      run a coding task via 5-stage pipeline");
  console.log("  pi pipeline \"<task>\"        same as --pipeline");
  console.log("  pi swarm \"<goal>\"           dispatch 6-agent parallel swarm");
  console.log("  pi search \"<query>\"         single researcher agent");
  console.log("  pi audit                    security + code-review agents");
  console.log("  pi review                   single code-reviewer agent");
  console.log("  pi multica <name> \"<task>\"  Multica-style named agent (jorvis/jouono/scout/summit/quill/surge/cipher/forge)");
  console.log("  pi bench                    run eval bench");
  console.log("  pi merge <id>               merge a task's worktree into main");
  console.log("  pi replay <id>              show a session's files");
  console.log("  pi doctor                   check system + capabilities");
  console.log("  pi setup                    first-run setup wizard");
  console.log("  pi config                   show config");
  console.log("  pi config set <k> <v>       set config (model, provider, baseUrl)");
  console.log("  pi config set-key <provider> <key>   set API key");
  console.log("  pi --check                  show env + config");
  console.log("");
  console.log("flags:");
  console.log("  --pipeline                  use 5-stage pipeline (same as `pi pipeline`)");
  console.log("  --model <id>                override model for this run");
  console.log("  --json                      JSON output (bench only)");
  console.log("");
  console.log("config: ~/.pi/pi-config.json");
  console.log("auth:   ~/.pi/pi-auth.json");
  console.log("");
  console.log("examples:");
  console.log("  pi                                    # start interactive session");
  console.log("  pi \"add a /healthz endpoint\"           # run a task");
  console.log("  pi --pipeline \"add a /healthz endpoint\"");
  console.log("  pi pipeline --model deepseek-v4-flash \"add a /healthz endpoint\"");
  console.log("  pi swarm \"fix the auth bug and add tests\"");
  console.log("  pi swarm --plan \"add /healthz\"                # show plan first");
  console.log("  pi swarm --budget=5.00 --dry-run \"big refactor\"  # plan + cost estimate");
  console.log("  pi swarm --list                                # list all swarms");
  console.log("  pi swarm --status swarm_abc123");
  console.log("  pi swarm --continue swarm_abc123 --budget=10");
  console.log("  pi swarm --merge swarm_abc123");
  console.log("  pi multica jorvis \"research authentication patterns\"");
  console.log("  pi setup                              # first-run config");
  console.log("  pi config set model minimax-m3");
  console.log("  pi config set-key opencode-go sk-...");
  console.log("  pi bench");
}

async function printCheck(): Promise<void> {
  const { loadConfig, getApiKey } = await import("@pi/provider");
  const { PI_CONFIG_PATH, PI_AUTH_PATH, piHome } = await import("./config-paths.js");
  console.log(`pi v${PI_VERSION}`);
  console.log("─".repeat(50));
  console.log(`  cwd:          ${process.cwd()}`);
  console.log(`  pi home:      ${piHome()}`);
  console.log(`  config path:  ${PI_CONFIG_PATH}`);
  console.log(`  auth path:    ${PI_AUTH_PATH}`);
  console.log(`  stdout.isTTY: ${process.stdout.isTTY}`);
  try {
    const cfg = await loadConfig(PI_CONFIG_PATH);
    console.log(`  provider:     ${cfg.provider}`);
    console.log(`  model:        ${cfg.model}`);
    if (cfg.baseUrl) console.log(`  baseUrl:      ${cfg.baseUrl}`);
    const key = await getApiKey(cfg.provider, PI_AUTH_PATH);
    if (key) {
      const masked = key.length <= 8 ? "****" : `${key.slice(0, 4)}...${key.slice(-4)}`;
      console.log(`  api key:      ${masked}`);
    } else {
      console.log(`  api key:      (not set)`);
    }
  } catch (e) {
    console.log(`  config:       error: ${(e as Error).message}`);
  }
}

function parseFlags(args: string[]): {
  _: string[];
  model?: string;
  modelMap?: Record<string, string>;
  pipeline?: boolean;
  parallel?: boolean;
  concurrency?: string;
  quality?: number;
  refine?: number;
  tasks?: string;
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
  nonInteractive?: boolean;
} {
  const out: ReturnType<typeof parseFlags> = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--pipeline") out.pipeline = true;
    else if (a === "--parallel") out.parallel = true;
    else if (a === "--non-interactive" || a === "--no-input") out.nonInteractive = true;
    else if (a === "--model") { out.model = args[++i]; }
    else if (a === "--model-map") { try { out.modelMap = JSON.parse(args[++i] ?? "{}"); } catch { /* ignore */ } }
    else if (a === "--concurrency") { out.concurrency = args[++i]; }
    else if (a === "--quality") { out.quality = parseInt(args[++i] ?? "20", 10); }
    else if (a === "--refine") { out.refine = parseInt(args[++i] ?? "2", 10); }
    else if (a === "--tasks") { out.tasks = args[++i]; }
    else if (a === "--api-key") { out.apiKey = args[++i]; }
    else if (a === "--provider") { out.provider = args[++i]; }
    else if (a === "--base-url") { out.baseUrl = args[++i]; }
    else if (a === "--json") { /* json flag handled elsewhere */ }
    else if (a.startsWith("--")) { /* ignore unknown */ }
    else { out._.push(a); }
  }
  return out;
}

export async function run(): Promise<void> {
  const argv = process.argv.slice(2);

  // No args: launch interactive session
  if (argv.length === 0) {
    const { interactive } = await import("./commands/setup.js");
    await interactive();
    return;
  }

  const first = argv[0];

  if (first === "-h" || first === "--help" || first === "help") {
    showHelp();
    return;
  }

  if (first === "-v" || first === "--version" || first === "version") {
    console.log(`pi v${PI_VERSION}`);
    return;
  }

  if (first === "--check" || first === "--env" || first === "--debug-env") {
    await printCheck();
    return;
  }

  if (first === "doctor") {
    const { doctor } = await import("./commands/doctor.js");
    await doctor();
    return;
  }

  if (first === "setup") {
    const { setup } = await import("./commands/setup.js");
    const flags = parseFlags(argv.slice(1));
    await setup({
      nonInteractive: flags.nonInteractive,
      provider: flags.provider,
      model: flags.model,
      apiKey: flags.apiKey,
      baseUrl: flags.baseUrl,
    });
    return;
  }

  if (first === "config") {
    const { config } = await import("./commands/config.js");
    await config(argv[1], argv[2], argv[3]);
    return;
  }

  if (first === "merge") {
    const { runMerge } = await import("./commands/merge.js");
    await runMerge(argv[1] ?? "");
    return;
  }

  if (first === "replay") {
    const { replay } = await import("./commands/replay.js");
    await replay(argv[1] ?? "");
    return;
  }

  if (first === "pipeline") {
    const { pipeline } = await import("./commands/pipeline.js");
    const flags = parseFlags(argv.slice(1));
    const task = flags._.join(" ");
    if (!task) {
      console.error("usage: pi pipeline \"<task>\"");
      console.error("       pi pipeline --model deepseek-v4-flash \"<task>\"");
      process.exit(1);
    }
    await pipeline(task, { model: flags.model, modelMap: flags.modelMap, qualityThreshold: flags.quality, maxRefineLoops: flags.refine });
    return;
  }

  if (first === "swarm") {
    const swarm = await import("./commands/swarm.js");
    const { parseSwarmFlags } = swarm;
    const { positional, flags } = parseSwarmFlags(argv.slice(1));
    const workdir = process.cwd();
    if (flags.list) { await swarm.swarmList(workdir); return; }
    if (flags.continueId) { await swarm.swarmContinue(flags.continueId, workdir, flags); return; }
    if (flags.statusId) { await swarm.swarmStatus(flags.statusId, workdir); return; }
    if (flags.mergeId) { await swarm.swarmMerge(flags.mergeId, workdir); return; }
    const goal = positional.join(" ");
    if (!goal) {
      console.error("usage: pi swarm \"<goal>\" [--plan] [--budget=<usd>] [--dry-run] [--max-retries=N] [--legacy]");
      console.error("       pi swarm --list");
      console.error("       pi swarm --status <id>");
      console.error("       pi swarm --continue <id> [--budget=<usd>]");
      console.error("       pi swarm --merge <id>");
      process.exit(1);
    }
    await swarm.swarmGoal(goal, workdir, flags);
    return;
  }

  if (first === "search") {
    const { swarmSearch } = await import("./commands/swarm.js");
    const query = argv.slice(1).join(" ");
    if (!query) { console.error("usage: pi search \"<query>\""); process.exit(1); }
    await swarmSearch(query);
    return;
  }

  if (first === "audit") {
    const { swarmAudit } = await import("./commands/swarm.js");
    await swarmAudit();
    return;
  }

  if (first === "review") {
    const { swarmReview } = await import("./commands/swarm.js");
    await swarmReview();
    return;
  }

  if (first === "multica") {
    const { multicaSwarm } = await import("./commands/swarm.js");
    const agentName = argv[1];
    const task = argv.slice(2).join(" ");
    if (!agentName || !task) {
      console.error("usage: pi multica <name> \"<task>\"");
      console.error("  available: jorvis jouono scout summit quill surge cipher forge");
      process.exit(1);
    }
    await multicaSwarm(agentName, task);
    return;
  }

  if (first === "bench") {
    const { benchCommand } = await import("./commands/bench.js");
    const flags = parseFlags(argv.slice(1));
    await benchCommand({
      tasks: flags.tasks ? flags.tasks.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      model: flags.model,
      parallel: !!flags.parallel,
      concurrency: flags.concurrency ? parseInt(flags.concurrency, 10) : undefined,
      pipeline: !!flags.pipeline,
    });
    return;
  }

  if (first === "start" || first.startsWith("-")) {
    const flags = parseFlags(first === "start" ? argv.slice(1) : argv);
    const task = flags._.join(" ");
    if (!task && !flags.pipeline) {
      console.error("usage: pi \"<task>\" or pi --pipeline \"<task>\"");
      process.exit(1);
    }
    const { start } = await import("./commands/start.js");
    await start(task, { pipeline: !!flags.pipeline, model: flags.model });
    return;
  }

  // No subcommand: treat all args as task
  const flags = parseFlags(argv);
  const { start } = await import("./commands/start.js");
  await start(flags._.join(" "), { pipeline: !!flags.pipeline, model: flags.model });
}

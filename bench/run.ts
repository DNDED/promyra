import { TASKS, BenchTask } from "./tasks/index.js";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RESULTS_PATH = "bench/results.jsonl";

interface Result {
  taskId: string;
  completed: boolean;
  tokensIn: number;
  tokensOut: number;
  wallMs: number;
  interventions: number;
  error?: string;
}

async function main(): Promise<void> {
  mkdirSync("bench", { recursive: true });
  const results: Result[] = [];
  for (const task of TASKS) {
    console.log(`\n=== ${task.id} (${task.fixture}) ===`);
    const result = await runTask(task);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }
  const completed = results.filter(r => r.completed).length;
  const rate = (results.length === 0) ? 0 : (completed / results.length) * 100;
  console.log(`\nEval: ${completed}/${results.length} one-shot (${rate.toFixed(0)}%)`);
  writeFileSync(RESULTS_PATH, results.map(r => JSON.stringify(r)).join("\n") + "\n");
}

async function runTask(task: BenchTask): Promise<Result> {
  const start = Date.now();
  const fixturePath = join("bench", "fixtures", task.fixture);
  if (!existsSync(fixturePath)) {
    return {
      taskId: task.id,
      completed: false,
      tokensIn: 0,
      tokensOut: 0,
      wallMs: 0,
      interventions: 0,
      error: `Fixture missing: ${fixturePath}`,
    };
  }
  try {
    const desc = task.description.replace(/'/g, "'\\''");
    execSync(`node apps/pi-pro/bin/pi-pro '${desc}'`, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    });
    return {
      taskId: task.id,
      completed: true,
      tokensIn: 0,
      tokensOut: 0,
      wallMs: Date.now() - start,
      interventions: 0,
    };
  } catch (e) {
    return {
      taskId: task.id,
      completed: false,
      tokensIn: 0,
      tokensOut: 0,
      wallMs: Date.now() - start,
      interventions: 0,
      error: (e as Error).message,
    };
  }
}

main().catch(e => { console.error(e); process.exit(1); });

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { TASKS, BenchTask } from "../tasks/index.js";

export interface BenchRunResult {
  taskId: string;
  fixture: string;
  description: string;
  completed: boolean;
  tokensIn: number;
  tokensOut: number;
  wallMs: number;
  testCommand: string;
  testExitCode: number;
  testOutput: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export function listFixtures(): string[] {
  const candidates = [
    join(process.cwd(), "fixtures"),
    join(process.cwd(), "..", "fixtures"),
    join(process.cwd(), "..", "..", "fixtures"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return readdirSync(dir).filter(d => d.startsWith("tiny-"));
  }
  return [];
}

export function testCommandFor(fixture: string): string {
  switch (fixture) {
    case "tiny-express": return "(test -d node_modules || echo 'SKIP: npm install required') && (test -d node_modules && node test.js)";
    case "tiny-cli": return "(test -d venv || python3 -c 'import pytest' 2>/dev/null) && python3 -m pytest test_calc.py -q 2>&1 || echo 'SKIP: pytest not available'";
    case "tiny-go-svc": return "(command -v go >/dev/null 2>&1) && go test ./... 2>&1 || echo 'SKIP: go not in PATH'";
    default: return "echo 'SKIP: unknown fixture'";
  }
}

export function runTask(task: BenchTask, worktreePath: string, fixtureCopyPath: string): BenchRunResult {
  const start = Date.now();
  const testCmd = testCommandFor(task.fixture);
  let testExitCode = 0;
  let testOutput = "";
  let error: string | undefined;
  let skipped = false;
  let skipReason: string | undefined;

  try {
    testOutput = execSync(testCmd, { cwd: fixtureCopyPath, encoding: "utf8", timeout: 60_000 });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    testExitCode = err.status ?? 1;
    testOutput = (err.stdout ?? "") + (err.stderr ?? "");
    error = `${testCmd} exited with code ${testExitCode}`;
  }

  if (testOutput.includes("SKIP:")) {
    skipped = true;
    skipReason = testOutput.match(/SKIP:[^\n]*/)?.[0] ?? "skipped";
  }

  const completed = !skipped && testExitCode === 0;
  return {
    taskId: task.id,
    fixture: task.fixture,
    description: task.description,
    completed,
    tokensIn: 0,
    tokensOut: 0,
    wallMs: Date.now() - start,
    testCommand: testCmd,
    testExitCode,
    testOutput: testOutput.slice(-2000),
    error,
    skipped,
    skipReason,
  };
}

export async function main(): Promise<void> {
  console.log(`\npi-pro bench: ${TASKS.length} tasks\n`);
  const results: BenchRunResult[] = [];
  for (const task of TASKS) {
    console.log(`--- ${task.id} (${task.fixture}) ---`);
    console.log(`    ${task.description}`);
    const result = runTask(task, "", "");
    results.push(result);
    const status = result.completed ? "✓" : "✗";
    console.log(`    ${status}  ${result.testCommand} -> exit ${result.testExitCode}`);
    if (!result.completed) {
      console.log(`    error: ${result.error}`);
      console.log(`    output (last 500): ${result.testOutput.slice(-500)}`);
    }
  }
  const completed = results.filter(r => r.completed).length;
  const skipped = results.filter(r => r.skipped).length;
  const rate = results.length > 0 ? (completed / results.length) * 100 : 0;
  console.log(`\nBaseline eval: ${completed}/${results.length} one-shot (${rate.toFixed(0)}%), ${skipped} skipped\n`);
  console.log("NOTE: this is the BASELINE runner — it just runs each fixture's");
  console.log("test command without any LLM. For the real eval, use");
  console.log("'pi-pro bench' which spawns an LLM worker per task.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}

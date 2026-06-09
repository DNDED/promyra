import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isSafeBashCommand } from "./policy.js";

const execFileP = promisify(execFile);

export interface BashOpts {
  cwd?: string;
  timeoutMs?: number;
}

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface BashTool {
  name: "bash";
  description: string;
  input_schema: { type: "object"; properties: { cmd: { type: "string" } }; required: ["cmd"] };
  execute(input: { cmd: string }): Promise<BashResult>;
}

export function createBashTool(opts: BashOpts = {}): BashTool {
  const cwd = opts.cwd ?? process.cwd();
  const timeoutMs = opts.timeoutMs ?? 60_000;
  return {
    name: "bash",
    description: "Run a shell command. Dangerous patterns (rm -rf /, curl|sh, etc.) are blocked.",
    input_schema: { type: "object", properties: { cmd: { type: "string" } }, required: ["cmd"] },
    async execute({ cmd }) {
      const violation = isSafeBashCommand(cmd);
      if (violation) throw new Error(violation.message);
      try {
        const { stdout, stderr } = await execFileP("bash", ["-c", cmd], { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
        return { stdout, stderr, exitCode: 0 };
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string; code?: number };
        return {
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? (e as Error).message,
          exitCode: typeof err.code === "number" ? err.code : 1,
        };
      }
    },
  };
}

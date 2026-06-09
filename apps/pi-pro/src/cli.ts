import { Command } from "commander";
import { start } from "./commands/start.js";
import { resume } from "./commands/resume.js";
import { replay } from "./commands/replay.js";
import { runMerge } from "./commands/merge.js";
import { doctor } from "./commands/doctor.js";
import { config } from "./commands/config.js";

export function main(): void {
  const program = new Command();
  program
    .name("pi-pro")
    .description("Improved coding agent on top of pi-mono")
    .version("0.1.0")
    .argument("[task...]", "task description")
    .action(async (task: string[]) => {
      if (task.length === 0) {
        await start();
      } else {
        await start(task.join(" "));
      }
    });

  program
    .command("resume [taskId]")
    .description("resume a task by id (or the most recent)")
    .action(async (taskId?: string) => resume(taskId));

  program
    .command("replay <taskId>")
    .description("replay a session step-by-step")
    .action(async (taskId: string) => replay(taskId));

  program
    .command("merge <taskId>")
    .description("rebase worktree and open a PR")
    .action(async (taskId: string) => runMerge(taskId));

  program
    .command("doctor")
    .description("check git, providers, and skills")
    .action(async () => doctor());

  program
    .command("config [action] [key] [value]")
    .description("show or update pi-pro configuration")
    .action(async (action?: string, key?: string, value?: string) => config(action, key, value));

  program.parseAsync(process.argv).catch(e => { console.error(e); process.exit(1); });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

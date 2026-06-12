import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function findSessionDir(taskId: string): string | null {
  const candidates = [
    join(homedir(), ".pi-pro", "sessions", taskId),
    join(process.cwd(), ".pi-pro", "sessions", taskId),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

export async function replay(taskId: string): Promise<void> {
  const dir = findSessionDir(taskId);
  if (!dir) {
    console.error(`✗ no session found for ${taskId}`);
    process.exit(1);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  console.log(`replay ${taskId}`);
  console.log("─".repeat(40));
  for (const f of files.sort()) {
    const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
    console.log(`  ${f}: ${data.title ?? "untitled"}`);
  }
}

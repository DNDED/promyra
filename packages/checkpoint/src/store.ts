import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { Checkpoint, CheckpointSchema } from "./types.js";

const SESSIONS_DIR = ".pi-pro/sessions";
const CHECKPOINTS_DIR = ".pi-pro/checkpoints";

export class CheckpointStore {
  constructor(private readonly rootDir: string = process.cwd()) {}

  private sessionsPath(): string { return join(this.rootDir, SESSIONS_DIR); }
  private checkpointPath(taskId: string, id: string): string {
    return join(this.rootDir, CHECKPOINTS_DIR, taskId, `${id}.json`);
  }

  async ensureDirs(taskId: string): Promise<void> {
    await mkdir(dirname(this.checkpointPath(taskId, "x")), { recursive: true });
    await mkdir(this.sessionsPath(), { recursive: true });
  }

  newId(seq: number): string {
    return `chk_${String(seq).padStart(6, "0")}`;
  }

  newTaskId(): string {
    return `tsk_${randomBytes(5).toString("hex")}`;
  }

  hashPayload(payload: unknown): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  }

  async snapshot(input: Omit<Checkpoint, "id" | "createdAt"> & { seq: number }): Promise<Checkpoint> {
    const cp = CheckpointSchema.parse({
      id: this.newId(input.seq),
      taskId: input.taskId,
      state: input.state,
      gitTreeSha: input.gitTreeSha,
      createdAt: new Date().toISOString(),
      payload: input.payload,
    });
    await this.ensureDirs(cp.taskId);
    await writeFile(this.checkpointPath(cp.taskId, cp.id), JSON.stringify(cp, null, 2));
    await this.appendSession(cp);
    return cp;
  }

  async appendSession(cp: Checkpoint): Promise<void> {
    const event = {
      ts: cp.createdAt,
      state: cp.state,
      event: "checkpoint",
      data: {
        id: cp.id,
        gitTreeSha: cp.gitTreeSha,
        payload: cp.payload,
      },
    };
    const line = JSON.stringify(event) + "\n";
    const logPath = join(this.sessionsPath(), `${cp.taskId}.jsonl`);
    await writeFile(logPath, line, { flag: "a" });
  }

  async listForTask(taskId: string): Promise<Checkpoint[]> {
    const dir = join(this.rootDir, CHECKPOINTS_DIR, taskId);
    if (!existsSync(dir)) return [];
    const files = (await readdir(dir)).filter(f => f.endsWith(".json")).sort();
    const out: Checkpoint[] = [];
    for (const f of files) {
      const raw = await readFile(join(dir, f), "utf8");
      out.push(CheckpointSchema.parse(JSON.parse(raw)));
    }
    return out;
  }

  async latest(taskId: string): Promise<Checkpoint | null> {
    const all = await this.listForTask(taskId);
    return all.length ? all[all.length - 1] : null;
  }

  async clearTask(taskId: string): Promise<void> {
    const dir = join(this.rootDir, CHECKPOINTS_DIR, taskId);
    if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
    const log = join(this.sessionsPath(), `${taskId}.jsonl`);
    if (existsSync(log)) await rm(log);
  }
}

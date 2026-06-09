import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, isAbsolute } from "node:path";
import { scanForSecrets } from "./policy.js";

export interface WriteOpts {
  cwd?: string;
}

export interface WriteTool {
  name: "write";
  description: string;
  input_schema: {
    type: "object";
    properties: { path: { type: "string" }; content: { type: "string" } };
    required: ["path", "content"];
  };
  execute(input: { path: string; content: string }): Promise<void>;
}

export function createWriteTool(opts: WriteOpts = {}): WriteTool {
  const cwd = opts.cwd ?? process.cwd();
  return {
    name: "write",
    description: "Write content to a file at the given path, creating directories as needed.",
    input_schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    async execute({ path, content }) {
      const abs = isAbsolute(path) ? path : resolve(cwd, path);
      const violations = scanForSecrets(content);
      if (violations.length > 0) {
        throw new Error(`write: refusing to write ${path} — ${violations.map(v => v.message).join("; ")}`);
      }
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
    },
  };
}

import { readFile } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";

export interface ReadOpts {
  cwd?: string;
}

export interface ReadTool {
  name: "read";
  description: string;
  input_schema: { type: "object"; properties: { path: { type: "string" } }; required: ["path"] };
  execute(input: { path: string }): Promise<string>;
}

export function createReadTool(opts: ReadOpts = {}): ReadTool {
  const cwd = opts.cwd ?? process.cwd();
  return {
    name: "read",
    description: "Read the contents of a file at the given path.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    async execute({ path }) {
      const abs = isAbsolute(path) ? path : resolve(cwd, path);
      if (cwd && !abs.startsWith(resolve(cwd))) {
        throw new Error(`read: path "${path}" is outside working dir ${cwd}`);
      }
      return readFile(abs, "utf8");
    },
  };
}

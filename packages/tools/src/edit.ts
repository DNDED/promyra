import { readFile, writeFile } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import { scanForSecrets } from "./policy.js";

export interface EditOpts {
  cwd?: string;
}

export interface EditTool {
  name: "edit";
  description: string;
  input_schema: {
    type: "object";
    properties: { path: { type: "string" }; oldText: { type: "string" }; newText: { type: "string" } };
    required: ["path", "oldText", "newText"];
  };
  execute(input: { path: string; oldText: string; newText: string }): Promise<{ replaced: number }>;
}

export function createEditTool(opts: EditOpts = {}): EditTool {
  const cwd = opts.cwd ?? process.cwd();
  return {
    name: "edit",
    description: "Replace an exact string in a file with new text. Throws if the old text is not found.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } },
      required: ["path", "oldText", "newText"],
    },
    async execute({ path, oldText, newText }) {
      const abs = isAbsolute(path) ? path : resolve(cwd, path);
      const current = await readFile(abs, "utf8");
      const occurrences = current.split(oldText).length - 1;
      if (occurrences === 0) {
        throw new Error(`edit: oldText not found in ${path}`);
      }
      const next = current.replace(oldText, newText);
      const violations = scanForSecrets(next);
      if (violations.length > 0) {
        throw new Error(`edit: refusing to write ${path} — ${violations.map(v => v.message).join("; ")}`);
      }
      await writeFile(abs, next, "utf8");
      return { replaced: occurrences };
    },
  };
}

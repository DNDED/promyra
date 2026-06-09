import { readdir } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";

export interface GlobOpts {
  cwd?: string;
  maxDepth?: number;
}

export interface GlobTool {
  name: "glob";
  description: string;
  input_schema: {
    type: "object";
    properties: { pattern: { type: "string" }; path?: { type: "string" } };
    required: ["pattern"];
  };
  execute(input: { pattern: string; path?: string }): Promise<{ files: string[] }>;
}

const IGNORE_DIRS = new Set(["node_modules", "dist", ".git", ".pi-pro"]);

export function createGlobTool(opts: GlobOpts = {}): GlobTool {
  const cwd = opts.cwd ?? process.cwd();
  const maxDepth = opts.maxDepth ?? 6;
  return {
    name: "glob",
    description: "Find files matching a glob pattern. The pattern is interpreted as a tail substring match.",
    input_schema: {
      type: "object",
      properties: { pattern: { type: "string" }, path: { type: "string" } },
      required: ["pattern"],
    },
    async execute({ pattern, path }) {
      const root = path ? (isAbsolute(path) ? path : resolve(cwd, path)) : cwd;
      const out: string[] = [];
      await walk(root, cwd, pattern, out, 0, maxDepth);
      return { files: out };
    },
  };
}

async function walk(dir: string, root: string, pattern: string, out: string[], depth: number, maxDepth: number): Promise<void> {
  if (depth > maxDepth) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      await walk(full, root, pattern, out, depth + 1, maxDepth);
    } else if (e.isFile() && matchTail(pattern, e.name)) {
      out.push(relative(root, full));
    }
  }
}

function matchTail(pattern: string, name: string): boolean {
  if (pattern.startsWith("**/")) return name.endsWith(pattern.slice(3));
  if (pattern.startsWith("*.")) return name.endsWith(pattern.slice(1));
  return name === pattern || name.endsWith(pattern);
}

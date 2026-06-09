import { readdir, readFile } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";

export interface GrepOpts {
  cwd?: string;
  maxDepth?: number;
}

export interface GrepMatch {
  path: string;
  line: string;
  lineNumber: number;
}

export interface GrepTool {
  name: "grep";
  description: string;
  input_schema: {
    type: "object";
    properties: { pattern: { type: "string" }; path?: { type: "string" } };
    required: ["pattern"];
  };
  execute(input: { pattern: string; path?: string }): Promise<{ matches: GrepMatch[] }>;
}

const IGNORE_DIRS = new Set(["node_modules", "dist", ".git", ".pi-pro"]);

export function createGrepTool(opts: GrepOpts = {}): GrepTool {
  const cwd = opts.cwd ?? process.cwd();
  const maxDepth = opts.maxDepth ?? 8;
  return {
    name: "grep",
    description: "Search for a regex pattern in files under cwd (or under a specific path).",
    input_schema: {
      type: "object",
      properties: { pattern: { type: "string" }, path: { type: "string" } },
      required: ["pattern"],
    },
    async execute({ pattern, path }) {
      const re = new RegExp(pattern);
      const root = path ? (isAbsolute(path) ? path : resolve(cwd, path)) : cwd;
      const out: GrepMatch[] = [];
      await walk(root, cwd, re, out, 0, maxDepth);
      return { matches: out };
    },
  };
}

async function walk(dir: string, root: string, re: RegExp, out: GrepMatch[], depth: number, maxDepth: number): Promise<void> {
  if (depth > maxDepth) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      await walk(full, root, re, out, depth + 1, maxDepth);
    } else if (e.isFile()) {
      try {
        const content = await readFile(full, "utf8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            out.push({ path: relative(root, full), line: lines[i], lineNumber: i + 1 });
          }
        }
      } catch { /* skip */ }
    }
  }
}

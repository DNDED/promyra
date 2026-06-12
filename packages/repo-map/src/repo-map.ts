/**
 * v0.5.0 repo-map main entry.
 *
 * `get_repo_map(query, k)` scans a directory tree, extracts symbols via
 * regex (graceful-degrade path), ranks by query relevance, and returns
 * a top-k rendered text block suitable for embedding in a system prompt.
 *
 * Per spec:
 *   - Lazy build: only on first call per session
 *   - Refresh: file watcher (out of scope for v0.5.0; rebuild on demand)
 *   - Graceful degrade: parse errors on individual files skip those files
 *   - Token budget: top-k output truncated to ~1024 tokens
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { extractSymbolsFromFile } from "./extract.js";
import type { RepoMap, RepoMapOpts, Symbol, RankedSymbol } from "./types.js";

const DEFAULT_INCLUDE: string[] = []; // empty = include all
const DEFAULT_EXCLUDE: string[] = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  ".promyra",
  "target",
];

/** Cheap glob-like match: `*` and `**` wildcards. */
function globMatch(name: string, pattern: string): boolean {
  if (!pattern.includes("*")) return name === pattern;
  const re = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
  return re.test(name);
}

function isExcluded(relPath: string, excludes: string[]): boolean {
  const parts = relPath.split("/");
  for (const part of parts) {
    for (const ex of excludes) {
      if (globMatch(part, ex)) return true;
    }
  }
  return false;
}

/** Walk a directory recursively, yielding file paths. */
async function* walkFiles(
  root: string,
  excludes: string[],
  includeGlobs: string[],
): AsyncGenerator<string> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = join(root, name);
    const rel = relative(root, abs);
    if (isExcluded(rel, excludes)) continue;
    if (includeGlobs.length > 0 && !includeGlobs.some(g => globMatch(rel, g))) continue;
    let s;
    try {
      s = await stat(abs);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      yield* walkFiles(abs, excludes, includeGlobs);
    } else if (s.isFile()) {
      yield abs;
    }
  }
}

/** Score a symbol by relevance to the query. */
function scoreSymbol(sym: Symbol, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 1; // no query: all symbols equal
  const haystack = `${sym.name} ${sym.kind} ${sym.file} ${sym.signature}`.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (sym.name.toLowerCase().includes(term)) score += 5;
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

function renderMap(ranked: RankedSymbol[], tokenBudget: number, charsPerToken: number): string {
  const maxChars = tokenBudget * charsPerToken;
  const lines: string[] = [];
  let used = 0;
  for (const { symbol } of ranked) {
    const line = `${symbol.file}:${symbol.line}  ${symbol.kind.padEnd(9)}  ${symbol.signature}`;
    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

/**
 * Build a repo map for a directory. `query` is a free-form string used
 * to rank symbols. Returns a `RepoMap` with top-k symbols and a rendered
 * text block.
 */
export async function getRepoMap(
  rootDir: string,
  query: string = "",
  opts: RepoMapOpts = {},
): Promise<RepoMap> {
  const maxSymbols = opts.maxSymbols ?? 50;
  const tokenBudget = opts.tokenBudget ?? 1024;
  const charsPerToken = opts.charsPerToken ?? 4;
  const excludes = opts.excludeGlobs ?? DEFAULT_EXCLUDE;
  const includeGlobs = opts.includeGlobs ?? DEFAULT_INCLUDE;

  const queryTerms = query
    .toLowerCase()
    .split(/[\s,._/-]+/)
    .filter(t => t.length >= 2);

  const symbols: Symbol[] = [];
  let fileCount = 0;

  for await (const abs of walkFiles(rootDir, excludes, includeGlobs)) {
    const ext = extname(abs).slice(1);
    // Only process files we have patterns for
    if (!["ts","tsx","js","jsx","mjs","cjs","py","go","rs","rb"].includes(ext)) continue;
    fileCount++;
    let content: string;
    try {
      content = await readFile(abs, "utf8");
    } catch {
      continue; // skip unreadable files
    }
    try {
      const fileSyms = extractSymbolsFromFile(relative(rootDir, abs) || abs, content, 30);
      symbols.push(...fileSyms);
    } catch {
      continue; // skip parse-error files
    }
  }

  // Dedupe by (name, file) — regex can produce duplicates
  const seen = new Set<string>();
  const deduped = symbols.filter(s => {
    const k = `${s.name}|${s.file}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Rank
  const ranked: RankedSymbol[] = deduped
    .map(s => ({ symbol: s, score: scoreSymbol(s, queryTerms) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSymbols);

  return {
    topSymbols: ranked,
    fileCount,
    symbolCount: deduped.length,
    rendered: renderMap(ranked, tokenBudget, charsPerToken),
  };
}

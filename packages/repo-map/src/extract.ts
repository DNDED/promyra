/**
 * v0.5.0 symbol extraction.
 *
 * Per-language regex patterns for finding top-level definitions. This
 * is the "graceful degrade" path of the spec — when tree-sitter isn't
 * available, we still get a useful symbol index via regex.
 *
 * Limitations: regex doesn't understand scope, so we may pick up
 * commented-out code, strings that look like definitions, etc. For the
 * v0.5.0 repo map use case (LLM context for navigation), this is good
 * enough. Future: replace with tree-sitter WASM if/when needed.
 */

import type { LangPattern, Symbol, SymbolKind } from "./types.js";

export const LANG_PATTERNS: LangPattern[] = [
  {
    exts: ["ts", "tsx", "js", "jsx", "mjs", "cjs"],
    patterns: [
      { kind: "class", re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/m },
      { kind: "interface", re: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/m },
      { kind: "type", re: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/m },
      { kind: "function", re: /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/m },
      { kind: "function", re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function|\()/m },
      { kind: "method", re: /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/m },
      { kind: "const", re: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)/m },
    ],
  },
  {
    exts: ["py"],
    patterns: [
      { kind: "class", re: /^class\s+([A-Za-z_][\w]*)/m },
      { kind: "function", re: /^def\s+([A-Za-z_][\w]*)/m },
      { kind: "function", re: /^async\s+def\s+([A-Za-z_][\w]*)/m },
      { kind: "import", re: /^(?:from\s+[\w.]+\s+)?import\s+([A-Za-z_][\w]*)/m },
    ],
  },
  {
    exts: ["go"],
    patterns: [
      { kind: "function", re: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?([A-Za-z_][\w]*)/m },
      { kind: "type", re: /^type\s+([A-Za-z_][\w]*)/m },
      { kind: "interface", re: /^type\s+([A-Za-z_][\w]*)\s+interface/m },
    ],
  },
  {
    exts: ["rs"],
    patterns: [
      { kind: "function", re: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)/m },
      { kind: "type", re: /^\s*(?:pub\s+)?struct\s+([A-Za-z_][\w]*)/m },
      { kind: "interface", re: /^\s*(?:pub\s+)?trait\s+([A-Za-z_][\w]*)/m },
      { kind: "type", re: /^\s*(?:pub\s+)?enum\s+([A-Za-z_][\w]*)/m },
    ],
  },
  {
    exts: ["rb"],
    patterns: [
      { kind: "class", re: /^\s*class\s+([A-Za-z_][\w:]*)/m },
      { kind: "function", re: /^\s*def\s+([A-Za-z_][\w?!=]*)/m },
      { kind: "type", re: /^\s*module\s+([A-Za-z_][\w]*)/m },
    ],
  },
];

export function patternsFor(ext: string): LangPattern | undefined {
  for (const p of LANG_PATTERNS) {
    if (p.exts.includes(ext)) return p;
  }
  return undefined;
}

/**
 * Extract symbols from a single file's content. Returns up to `cap` symbols.
 * Skips lines that look commented (// or #) or inside multi-line strings
 * (best-effort; regex-based).
 */
export function extractSymbolsFromFile(
  filePath: string,
  content: string,
  cap: number = 50,
): Symbol[] {
  const ext = filePath.split(".").pop() ?? "";
  const lang = patternsFor(ext);
  if (!lang) return [];

  const out: Symbol[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("//") || line.trim().startsWith("#") || line.trim().startsWith("*")) {
      continue;
    }
    for (const { kind, re } of lang.patterns) {
      // Try matching on a single line
      const m = line.match(re);
      if (m && m[1]) {
        // Capture a signature: up to 120 chars around the match
        const sig = line.trim().length > 120 ? line.trim().slice(0, 117) + "..." : line.trim();
        out.push({
          name: m[1],
          kind,
          file: filePath,
          line: i + 1,
          signature: sig,
        });
        if (out.length >= cap) return out;
        break; // don't double-match same line
      }
    }
  }
  return out;
}

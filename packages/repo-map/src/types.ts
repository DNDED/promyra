/**
 * v0.5.0 repo-map types.
 */

/** A single symbol extracted from a source file. */
export interface Symbol {
  /** Symbol name (function/class/method/variable). */
  name: string;
  /** Kind: function, class, method, variable, export, type, interface, const. */
  kind: SymbolKind;
  /** File path (relative to repo root). */
  file: string;
  /** 1-indexed line number. */
  line: number;
  /** Full signature/declaration, truncated to a max width. */
  signature: string;
}

export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "variable"
  | "const"
  | "export"
  | "type"
  | "interface"
  | "import";

/** A ranked list of symbols with their relevance score. */
export interface RankedSymbol {
  symbol: Symbol;
  /** Higher = more relevant. */
  score: number;
}

/** The full repo map result, ready to be embedded in a system prompt. */
export interface RepoMap {
  /** Top-k symbols ranked by query relevance. */
  topSymbols: RankedSymbol[];
  /** Total number of files scanned. */
  fileCount: number;
  /** Total number of symbols found before filtering. */
  symbolCount: number;
  /** Rendered map (truncated to `tokenBudget`). */
  rendered: string;
}

/** Per-language symbol extraction pattern. */
export interface LangPattern {
  /** Extensions matched (e.g. ["ts", "tsx"]). */
  exts: string[];
  /** Regex with capture group 1 = symbol name. */
  patterns: Array<{ kind: SymbolKind; re: RegExp }>;
}

export interface RepoMapOpts {
  /** Max symbols returned (default 50). */
  maxSymbols?: number;
  /** Max tokens in rendered output (default 1024). */
  tokenBudget?: number;
  /** Subset of file globs to include (default all source files). */
  includeGlobs?: string[];
  /** Subset of file globs to exclude (default node_modules, .git, dist). */
  excludeGlobs?: string[];
  /** Approximate chars per token (default 4). */
  charsPerToken?: number;
}

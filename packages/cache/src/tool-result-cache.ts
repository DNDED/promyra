/**
 * v0.5.0 ToolResultCache.
 *
 * In-memory LRU cache for tool results, scoped to one session.
 * - Key: `sha256(stableJson(tool + args))` via `toolKeyHash`.
 * - Capacity: 256 entries by default (configurable).
 * - Invalidation:
 *   - File-mtime check on `get(key, currentMtime)` — entry invalidated if stored
 *     mtime is older than the file's current mtime.
 *   - `invalidateForFile(path)` — removes all entries that referenced `path`.
 * - Storage: `Map<key, { value, fileMtime?, files? }>`; insertion order is LRU.
 */

import { toolKeyHash } from "./prompt-cache.js";
import type { ToolCacheKey, ToolCacheEntry } from "./types.js";

export interface ToolResultCacheOpts {
  maxEntries?: number;
}

export class ToolResultCache {
  private readonly maxEntries: number;
  private readonly store = new Map<string, { value: unknown; entry: ToolCacheEntry }>();

  constructor(opts: ToolResultCacheOpts = {}) {
    this.maxEntries = opts.maxEntries ?? 256;
  }

  private keyOf(k: ToolCacheKey): string {
    return toolKeyHash(k.tool, k.args);
  }

  get(key: ToolCacheKey, currentMtime?: number): unknown {
    const h = this.keyOf(key);
    const rec = this.store.get(h);
    if (!rec) return undefined;

    // mtime check: if caller provided a current mtime and our entry has an
    // older mtime for the same file, the file changed → invalidate.
    if (currentMtime !== undefined && rec.entry.fileMtime !== undefined) {
      if (currentMtime > rec.entry.fileMtime) {
        this.store.delete(h);
        return undefined;
      }
    }

    // Touch: re-insert to bump LRU position
    this.store.delete(h);
    this.store.set(h, rec);
    return rec.value;
  }

  set(key: ToolCacheKey, value: unknown, entry?: ToolCacheEntry): void {
    const h = this.keyOf(key);
    // Auto-detect file paths in args (path, file_path, file keys) so that
    // invalidateForFile works without callers having to pass files
    // explicitly. Callers can still pass `entry.files` to override.
    const detectedFiles = detectFilePaths(key.args);
    const finalEntry: ToolCacheEntry = entry ?? {
      result: typeof value === "string" ? value : JSON.stringify(value),
      files: detectedFiles.length > 0 ? detectedFiles : undefined,
    };
    if (this.store.has(h)) this.store.delete(h);
    this.store.set(h, { value, entry: finalEntry });
    while (this.store.size > this.maxEntries) {
      const first = this.store.keys().next().value;
      if (first === undefined) break;
      this.store.delete(first);
    }
  }

  has(key: ToolCacheKey): boolean {
    return this.store.has(this.keyOf(key));
  }

  delete(key: ToolCacheKey): boolean {
    return this.store.delete(this.keyOf(key));
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  /**
   * Remove all entries that reference the given file path. Used when a
   * write/edit tool modifies a file; downstream readers should re-execute.
   */
  invalidateForFile(path: string): void {
    for (const [k, rec] of this.store) {
      if (rec.entry.files?.includes(path)) {
        this.store.delete(k);
      }
    }
  }
}

const FILE_KEYS = new Set(["path", "file_path", "file", "filePath"]);

function detectFilePaths(args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of Object.keys(args)) {
    if (FILE_KEYS.has(k) && typeof args[k] === "string") {
      out.push(args[k] as string);
    }
  }
  return out;
}

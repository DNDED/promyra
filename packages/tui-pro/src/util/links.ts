export type LinkSegment = { type: "text"; content: string } | { type: "url"; href: string; content: string };

const URL_RE = /\bhttps?:\/\/[^\s)<>\]'"`]+/g;
const FILE_LINE_RE = /(^|\s)([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|md|json|yaml|yml|toml|sh)):(\d+)/g;
const FILE_URL_RE = /\bfile:\/\/[^\s)<>\]'"`]+/g;

export function parseLinks(text: string): LinkSegment[] {
  if (!text) return [];
  const ranges: Array<{ start: number; end: number; segment: LinkSegment }> = [];

  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    ranges.push({
      start: m.index,
      end: m.index + m[0].length,
      segment: { type: "url", href: m[0], content: m[0] },
    });
  }

  FILE_URL_RE.lastIndex = 0;
  while ((m = FILE_URL_RE.exec(text)) !== null) {
    ranges.push({
      start: m.index,
      end: m.index + m[0].length,
      segment: { type: "url", href: m[0], content: m[0] },
    });
  }

  FILE_LINE_RE.lastIndex = 0;
  while ((m = FILE_LINE_RE.exec(text)) !== null) {
    const leading = m[1];
    const file = m[2];
    const line = m[3];
    const start = m.index + leading.length;
    const end = start + file.length + 1 + line.length;
    const href = `file://${process.cwd()}/${file}#L${line}`;
    ranges.push({ start, end, segment: { type: "url", href, content: `${file}:${line}` } });
  }

  if (ranges.length === 0) return [{ type: "text", content: text }];

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const dedup: typeof ranges = [];
  for (const r of ranges) {
    const last = dedup[dedup.length - 1];
    if (last && r.start < last.end) continue;
    dedup.push(r);
  }

  const out: LinkSegment[] = [];
  let cursor = 0;
  for (const r of dedup) {
    if (r.start > cursor) {
      out.push({ type: "text", content: text.slice(cursor, r.start) });
    }
    out.push(r.segment);
    cursor = r.end;
  }
  if (cursor < text.length) {
    out.push({ type: "text", content: text.slice(cursor) });
  }
  return out;
}

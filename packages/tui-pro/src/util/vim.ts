export type VimMode = "insert" | "normal" | "visual";
export type OpKind = "none" | "delete" | "change" | "yank";

export interface VimState {
  text: string;
  cursor: number;
  anchor: number;
  mode: VimMode;
  /** Pending operator (d, c, y). When set, next motion applies it. */
  pendingOp: OpKind;
  /** Pending count (e.g. "3" before "dw" → delete 3 words). */
  pendingCount: number;
  /** Undo stack: snapshots before each change. */
  undoStack: Array<{ text: string; cursor: number }>;
}

export const INITIAL_VIM: VimState = {
  text: "",
  cursor: 0,
  anchor: 0,
  mode: "insert",
  pendingOp: "none",
  pendingCount: 0,
  undoStack: [],
};

export interface VimResult {
  state: VimState;
  /** What happened, for logging/debugging. */
  op?: string;
}

export function pushUndo(state: VimState): VimState {
  return { ...state, undoStack: [...state.undoStack, { text: state.text, cursor: state.cursor }] };
}

export function getCount(state: VimState, n: number): number {
  if (n > 0) return state.pendingCount * 10 + n;
  if (state.pendingCount > 0) return state.pendingCount;
  return 1;
}

export function wordForwardN(text: string, from: number, n: number): number {
  let pos = from;
  for (let i = 0; i < n; i++) pos = wordForward1(text, pos);
  return pos;
}

function wordForward1(text: string, from: number): number {
  if (from >= text.length) return text.length;
  let i = from;
  if (/\w/.test(text[i] ?? "")) {
    while (i < text.length && /\w/.test(text[i] ?? "")) i++;
  }
  while (i < text.length && !/\w/.test(text[i] ?? "")) i++;
  return i;
}

export function wordBackwardN(text: string, from: number, n: number): number {
  let pos = from;
  for (let i = 0; i < n; i++) pos = wordBackward1(text, pos);
  return pos;
}

function wordBackward1(text: string, from: number): number {
  if (from <= 0) return 0;
  let i = Math.min(from, text.length);
  while (i > 0 && !/\w/.test(text[i - 1] ?? "")) i--;
  while (i > 0 && /\w/.test(text[i - 1] ?? "")) i--;
  return i;
}

export function wordEndN(text: string, from: number, n: number): number {
  let pos = from;
  for (let i = 0; i < n; i++) pos = wordEnd1(text, pos);
  return pos;
}

function wordEnd1(text: string, from: number): number {
  let i = Math.min(from, text.length);
  if (i >= text.length) return text.length;
  const onWord = /\w/.test(text[i] ?? "");
  const atWordEnd = onWord && (i === text.length - 1 || !/\w/.test(text[i + 1] ?? ""));
  if (atWordEnd) {
    i++;
    while (i < text.length && !/\w/.test(text[i] ?? "")) i++;
    while (i < text.length && /\w/.test(text[i] ?? "")) i++;
    return Math.max(0, i - 1);
  }
  if (onWord) {
    while (i < text.length && /\w/.test(text[i] ?? "")) i++;
    return i - 1;
  }
  while (i < text.length && !/\w/.test(text[i] ?? "")) i++;
  while (i < text.length && /\w/.test(text[i] ?? "")) i++;
  return Math.max(0, i - 1);
}

export interface OpResult {
  text: string;
  cursor: number;
  /** Whether the operation was a complete line-wise action. */
  lineWise: boolean;
}

export function applyDelete(text: string, from: number, to: number): OpResult {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return {
    text: text.slice(0, start) + text.slice(end),
    cursor: start,
    lineWise: false,
  };
}

export function applyLineDelete(text: string, cursor: number): OpResult {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  let lineEnd = text.indexOf("\n", cursor);
  if (lineEnd === -1) {
    if (lineStart > 0) {
      return {
        text: text.slice(0, lineStart - 1),
        cursor: lineStart - 1,
        lineWise: true,
      };
    }
    return { text: "", cursor: 0, lineWise: true };
  }
  return {
    text: text.slice(0, lineStart) + text.slice(lineEnd + 1),
    cursor: lineStart,
    lineWise: true,
  };
}

export function applyLineYank(text: string, cursor: number): { yanked: string; result: OpResult } {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  let lineEnd = text.indexOf("\n", cursor);
  if (lineEnd === -1) lineEnd = text.length;
  else lineEnd = lineEnd + 1;
  const yanked = text.slice(lineStart, lineEnd);
  return { yanked, result: { text, cursor, lineWise: true } };
}

export function applyLineChange(text: string, cursor: number): { text: string; cursor: number; yanked: string } {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  const lineEnd = text.indexOf("\n", cursor);
  const lastLine = lineEnd === -1;
  const deletedEnd = lastLine ? text.length : lineEnd;
  const yanked = text.slice(lineStart, deletedEnd);
  let text2 = text.slice(0, lineStart) + text.slice(deletedEnd);
  let newCursor = lineStart;
  if (lastLine) {
    if (lineStart > 0) {
      text2 = text.slice(0, lineStart - 1);
      newCursor = lineStart - 1;
    } else {
      newCursor = lineStart;
    }
  }
  return { text: text2, cursor: newCursor, yanked };
}

export function pasteAfter(text: string, cursor: number, yanked: string, lineWise: boolean): { text: string; cursor: number } {
  if (lineWise) {
    let lineEnd = text.indexOf("\n", cursor);
    if (lineEnd === -1) lineEnd = text.length;
    else lineEnd = lineEnd + 1;
    const insertAt = lineEnd;
    const newText = text.slice(0, insertAt) + yanked + text.slice(insertAt);
    return { text: newText, cursor: insertAt + yanked.length - (yanked.endsWith("\n") ? 1 : 0) };
  }
  const newText = text.slice(0, cursor + 1) + yanked + text.slice(cursor + 1);
  return { text: newText, cursor: cursor + yanked.length };
}

export function pasteBefore(text: string, cursor: number, yanked: string, lineWise: boolean): { text: string; cursor: number } {
  if (lineWise) {
    const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
    const newText = text.slice(0, lineStart) + yanked + text.slice(lineStart);
    return { text: newText, cursor: lineStart + yanked.length - (yanked.endsWith("\n") ? 1 : 0) };
  }
  const newText = text.slice(0, cursor) + yanked + text.slice(cursor);
  return { text: newText, cursor: cursor + yanked.length };
}

export function clampCursor(text: string, cursor: number): number {
  if (cursor < 0) return 0;
  if (cursor > text.length) return text.length;
  return cursor;
}

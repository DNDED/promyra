import {
  type VimState,
  type VimResult,
  type OpKind,
  pushUndo,
  applyDelete,
  applyLineDelete,
  applyLineYank,
  applyLineChange,
  pasteAfter,
  pasteBefore,
  wordForwardN,
  wordBackwardN,
  wordEndN,
  clampCursor,
} from "./vim.js";

export interface YankBuffer {
  text: string;
  lineWise: boolean;
}

export interface VimRuntime {
  state: VimState;
  yank: YankBuffer | null;
}

export const INITIAL_RUNTIME: VimRuntime = {
  state: {
    text: "",
    cursor: 0,
    anchor: 0,
    mode: "insert",
    pendingOp: "none",
    pendingCount: 0,
    undoStack: [],
  },
  yank: null,
};

function makeResult(runtime: VimRuntime, op?: string): VimResult {
  return { state: { ...runtime.state, undoStack: runtime.state.undoStack }, op };
}

function withUndo(runtime: VimRuntime, mutate: (s: VimState) => VimState): VimRuntime {
  const oldState = runtime.state;
  const next = mutate(oldState);
  if (next.text !== oldState.text) {
    return {
      state: {
        ...next,
        undoStack: [...next.undoStack, { text: oldState.text, cursor: oldState.cursor }],
      },
      yank: runtime.yank,
    };
  }
  return { state: next, yank: runtime.yank };
}

function applyOp(
  runtime: VimRuntime,
  op: (text: string, cursor: number) => { text: string; cursor: number; yanked?: string },
): VimRuntime {
  const r = op(runtime.state.text, runtime.state.cursor);
  if (r.yanked !== undefined) {
    return {
      state: { ...runtime.state, text: r.text, cursor: r.cursor, pendingOp: "none", pendingCount: 0 },
      yank: { text: r.yanked, lineWise: false },
    };
  }
  return withUndo(runtime, (s) => ({ ...s, text: r.text, cursor: r.cursor, pendingOp: "none", pendingCount: 0 }));
}

function setCursor(runtime: VimRuntime, cursor: number, mode: VimState["mode"] = runtime.state.mode): VimRuntime {
  const c = clampCursor(runtime.state.text, cursor);
  return { ...runtime, state: { ...runtime.state, cursor: c, mode, pendingOp: "none", pendingCount: 0 } };
}

function setPending(runtime: VimRuntime, op: OpKind, count: number): VimRuntime {
  return { ...runtime, state: { ...runtime.state, pendingOp: op, pendingCount: count } };
}

function undo(runtime: VimRuntime): VimRuntime {
  if (runtime.state.undoStack.length === 0) return runtime;
  const last = runtime.state.undoStack[runtime.state.undoStack.length - 1]!;
  return {
    state: { ...runtime.state, text: last.text, cursor: last.cursor, undoStack: runtime.state.undoStack.slice(0, -1) },
    yank: runtime.yank,
  };
}

export function handleInsertKey(input: string, key: Record<string, boolean>, runtime: VimRuntime): VimRuntime {
  if (key.escape) {
    return { state: { ...runtime.state, mode: "normal", cursor: clampCursor(runtime.state.text, runtime.state.cursor - 1) }, yank: runtime.yank };
  }
  if (key.return) {
    return withUndo(runtime, (s) => ({
      ...s,
      text: s.text.slice(0, s.cursor) + "\n" + s.text.slice(s.cursor),
      cursor: s.cursor + 1,
    }));
  }
  if (key.backspace || key.delete) {
    if (runtime.state.cursor > 0) {
      return withUndo(runtime, (s) => {
        const next = s.text.slice(0, s.cursor - 1) + s.text.slice(s.cursor);
        return { ...s, text: next, cursor: s.cursor - 1 };
      });
    }
    return runtime;
  }
  if (input && !key.ctrl && !key.meta) {
    return withUndo(runtime, (s) => ({
      ...s,
      text: s.text.slice(0, s.cursor) + input + s.text.slice(s.cursor),
      cursor: s.cursor + input.length,
    }));
  }
  if (key.ctrl && input === "u") {
    return withUndo(runtime, (s) => ({ ...s, text: s.text.slice(s.cursor), cursor: 0 }));
  }
  if (key.ctrl && input === "a") {
    return setCursor(runtime, 0);
  }
  if (key.ctrl && input === "e") {
    return setCursor(runtime, runtime.state.text.length);
  }
  if (key.ctrl && input === "c") {
    process.exit(0);
  }
  return runtime;
}

export function handleNormalKey(input: string, key: Record<string, boolean>, runtime: VimRuntime): VimRuntime {
  if (key.ctrl && input === "c") {
    process.exit(0);
  }
  if (/^\d$/.test(input) && (runtime.state.pendingOp !== "none" || runtime.state.pendingCount > 0 || input !== "0")) {
    const n = Number(input);
    if (n === 0 && runtime.state.pendingOp === "none" && runtime.state.pendingCount === 0) {
      return setCursor(runtime, 0);
    }
    return setPending(runtime, runtime.state.pendingOp, runtime.state.pendingCount * 10 + n);
  }

  switch (input) {
    case "h":
    case "leftArrow": {
      const n = runtime.state.pendingCount || 1;
      return setCursor(runtime, runtime.state.cursor - n);
    }
    case "l":
    case "rightArrow": {
      const n = runtime.state.pendingCount || 1;
      return setCursor(runtime, runtime.state.cursor + n);
    }
    case "j":
    case "downArrow": {
      return setCursor(runtime, lineDown(runtime.state.text, runtime.state.cursor, runtime.state.pendingCount || 1));
    }
    case "k":
    case "upArrow": {
      return setCursor(runtime, lineUp(runtime.state.text, runtime.state.cursor, runtime.state.pendingCount || 1));
    }
    case "w": {
      const n = runtime.state.pendingCount || 1;
      const target = wordForwardN(runtime.state.text, runtime.state.cursor, n);
      return finishMotion(runtime, target, runtime.state.pendingOp === "yank");
    }
    case "b": {
      const n = runtime.state.pendingCount || 1;
      const target = wordBackwardN(runtime.state.text, runtime.state.cursor, n);
      return finishMotion(runtime, target, runtime.state.pendingOp === "yank");
    }
    case "e": {
      const n = runtime.state.pendingCount || 1;
      const target = wordEndN(runtime.state.text, runtime.state.cursor, n);
      return finishMotion(runtime, target, runtime.state.pendingOp === "yank");
    }
    case "0": {
      return setCursor(runtime, 0);
    }
    case "$": {
      const n = runtime.state.pendingCount || 1;
      return setCursor(runtime, lineEndN(runtime.state.text, runtime.state.cursor, n));
    }
    case "i": {
      return { state: { ...runtime.state, mode: "insert", pendingOp: "none", pendingCount: 0 }, yank: runtime.yank };
    }
    case "a": {
      return { state: { ...runtime.state, mode: "insert", cursor: clampCursor(runtime.state.text, runtime.state.cursor + 1), pendingOp: "none", pendingCount: 0 }, yank: runtime.yank };
    }
    case "I": {
      return { state: { ...runtime.state, mode: "insert", cursor: lineStart(runtime.state.text, runtime.state.cursor), pendingOp: "none", pendingCount: 0 }, yank: runtime.yank };
    }
    case "A": {
      return { state: { ...runtime.state, mode: "insert", cursor: lineEndN(runtime.state.text, runtime.state.cursor, 1), pendingOp: "none", pendingCount: 0 }, yank: runtime.yank };
    }
    case "o": {
      const cur = runtime.state.cursor;
      const lineStart_ = lineStart(runtime.state.text, cur);
      const lineEnd_ = lineEndN(runtime.state.text, cur, 1);
      const insertAt = lineEnd_;
      const newText = runtime.state.text.slice(0, insertAt) + "\n" + runtime.state.text.slice(insertAt);
      return withUndo(runtime, (s) => ({ ...s, text: newText, cursor: insertAt + 1, mode: "insert" }));
    }
    case "O": {
      const cur = runtime.state.cursor;
      const lineStart_ = lineStart(runtime.state.text, cur);
      const newText = runtime.state.text.slice(0, lineStart_) + "\n" + runtime.state.text.slice(lineStart_);
      return withUndo(runtime, (s) => ({ ...s, text: newText, cursor: lineStart_ + 1, mode: "insert" }));
    }
    case "x": {
      const n = runtime.state.pendingCount || 1;
      const start = runtime.state.cursor;
      const end = Math.min(runtime.state.text.length, start + n);
      const yanked = runtime.state.text.slice(start, end);
      return withUndo(runtime, (s) => ({ ...s, text: s.text.slice(0, start) + s.text.slice(end), cursor: start }));
    }
    case "X": {
      const n = runtime.state.pendingCount || 1;
      const start = Math.max(0, runtime.state.cursor - n);
      const end = runtime.state.cursor;
      return withUndo(runtime, (s) => ({ ...s, text: s.text.slice(0, start) + s.text.slice(end), cursor: start }));
    }
    case "d": {
      const n = runtime.state.pendingCount || 1;
      if (runtime.state.pendingOp === "none") {
        if (n > 1) {
          const r = applyLineDeleteN(runtime.state.text, runtime.state.cursor, n);
          return {
            state: { ...pushUndo({ ...runtime.state, text: r.text, cursor: r.cursor }), pendingOp: "none", pendingCount: 0 },
            yank: { text: r.yanked, lineWise: true },
          };
        }
        return setPending(runtime, "delete", 1);
      }
      if (runtime.state.pendingOp === "delete") {
        const r = applyLineDeleteN(runtime.state.text, runtime.state.cursor, 1);
        return {
          state: { ...pushUndo({ ...runtime.state, text: r.text, cursor: r.cursor }), mode: "insert", pendingOp: "none", pendingCount: 0 },
          yank: { text: r.yanked, lineWise: true },
        };
      }
      return runtime;
    }
    case "c": {
      if (runtime.state.pendingOp === "none") {
        if (runtime.state.pendingCount > 0) {
          const r = applyLineChangeN(runtime.state.text, runtime.state.cursor, runtime.state.pendingCount);
          return {
            state: { ...pushUndo({ ...runtime.state, text: r.text, cursor: r.cursor }), mode: "insert", pendingOp: "none", pendingCount: 0 },
            yank: { text: r.yanked, lineWise: true },
          };
        }
        return setPending(runtime, "change", 1);
      }
      if (runtime.state.pendingOp === "change") {
        const r = applyLineChangeN(runtime.state.text, runtime.state.cursor, 1);
        return {
          state: { ...pushUndo({ ...runtime.state, text: r.text, cursor: r.cursor }), mode: "insert", pendingOp: "none", pendingCount: 0 },
          yank: { text: r.yanked, lineWise: true },
        };
      }
      return runtime;
    }
    case "y": {
      const n = runtime.state.pendingCount || 1;
      if (runtime.state.pendingOp === "none") {
        if (n > 1) {
          const r = applyLineYankN(runtime.state.text, runtime.state.cursor, n);
          return {
            state: { ...runtime.state, pendingOp: "none", pendingCount: 0 },
            yank: { text: r.yanked, lineWise: true },
          };
        }
        return setPending(runtime, "yank", 1);
      }
      if (runtime.state.pendingOp === "yank") {
        const r = applyLineYankN(runtime.state.text, runtime.state.cursor, 1);
        return {
          state: { ...runtime.state, pendingOp: "none", pendingCount: 0 },
          yank: { text: r.yanked, lineWise: true },
        };
      }
      return runtime;
    }
    case "p": {
      if (!runtime.yank) return runtime;
      const n = runtime.state.pendingCount || 1;
      const r = pasteAfter(runtime.state.text, runtime.state.cursor, runtime.yank.text.repeat(n), runtime.yank.lineWise);
      return {
        state: { ...pushUndo({ ...runtime.state, text: r.text, cursor: r.cursor }), mode: "normal", pendingOp: "none", pendingCount: 0 },
        yank: runtime.yank,
      };
    }
    case "P": {
      if (!runtime.yank) return runtime;
      const n = runtime.state.pendingCount || 1;
      const r = pasteBefore(runtime.state.text, runtime.state.cursor, runtime.yank.text.repeat(n), runtime.yank.lineWise);
      return {
        state: { ...pushUndo({ ...runtime.state, text: r.text, cursor: r.cursor }), mode: "normal", pendingOp: "none", pendingCount: 0 },
        yank: runtime.yank,
      };
    }
    case "u": {
      return undo(runtime);
    }
    case "v": {
      return { state: { ...runtime.state, mode: "visual", anchor: runtime.state.cursor, pendingOp: "none", pendingCount: 0 }, yank: runtime.yank };
    }
    case "V": {
      const lineStart_ = lineStart(runtime.state.text, runtime.state.cursor);
      const lineEnd_ = lineEndN(runtime.state.text, runtime.state.cursor, 1);
      return { state: { ...runtime.state, mode: "visual", anchor: lineStart_, cursor: lineEnd_, pendingOp: "none", pendingCount: 0 }, yank: runtime.yank };
    }
    case "escape": {
      return { state: { ...runtime.state, mode: "normal", pendingOp: "none", pendingCount: 0 }, yank: runtime.yank };
    }
  }

  if (runtime.state.pendingOp === "delete" && input !== "d") {
    const target = motionTarget(input, runtime);
    if (target !== null) {
      const r = applyDelete(runtime.state.text, runtime.state.cursor, target);
      return {
        state: { ...pushUndo({ ...runtime.state, text: r.text, cursor: r.cursor }), mode: "normal", pendingOp: "none", pendingCount: 0 },
        yank: { text: runtime.state.text.slice(Math.min(runtime.state.cursor, target), Math.max(runtime.state.cursor, target)), lineWise: false },
      };
    }
  }
  if (runtime.state.pendingOp === "change" && input !== "c") {
    const target = motionTarget(input, runtime);
    if (target !== null) {
      const r = applyDelete(runtime.state.text, runtime.state.cursor, target);
      return {
        state: { ...pushUndo({ ...runtime.state, text: r.text, cursor: r.cursor }), mode: "insert", pendingOp: "none", pendingCount: 0 },
        yank: { text: runtime.state.text.slice(Math.min(runtime.state.cursor, target), Math.max(runtime.state.cursor, target)), lineWise: false },
      };
    }
  }
  if (runtime.state.pendingOp === "yank" && input !== "y") {
    const target = yankTarget(input, runtime);
    if (target !== null) {
      return {
        state: { ...runtime.state, mode: "normal", pendingOp: "none", pendingCount: 0 },
        yank: { text: runtime.state.text.slice(Math.min(runtime.state.cursor, target), Math.max(runtime.state.cursor, target)), lineWise: false },
      };
    }
  }
  return runtime;
}

function motionTarget(input: string, runtime: VimRuntime): number | null {
  switch (input) {
    case "h":
    case "leftArrow":
      return clampCursor(runtime.state.text, runtime.state.cursor - 1);
    case "l":
    case "rightArrow":
      return clampCursor(runtime.state.text, runtime.state.cursor + 1);
    case "w":
      return wordForwardN(runtime.state.text, runtime.state.cursor, 1);
    case "b":
      return wordBackwardN(runtime.state.text, runtime.state.cursor, 1);
    case "e":
      return wordEndN(runtime.state.text, runtime.state.cursor, 1) + 1;
    case "$":
      return lineEndN(runtime.state.text, runtime.state.cursor, 1);
    case "0":
      return 0;
  }
  return null;
}

function yankTarget(input: string, runtime: VimRuntime): number | null {
  switch (input) {
    case "w":
    case "e":
      return wordEndN(runtime.state.text, runtime.state.cursor, 1) + 1;
    case "b":
      return wordBackwardN(runtime.state.text, runtime.state.cursor, 1);
    case "h":
    case "leftArrow":
      return clampCursor(runtime.state.text, runtime.state.cursor - 1);
    case "l":
    case "rightArrow":
      return clampCursor(runtime.state.text, runtime.state.cursor + 1);
    case "$":
      return lineEndN(runtime.state.text, runtime.state.cursor, 1);
    case "0":
      return 0;
  }
  return null;
}

function finishMotion(runtime: VimRuntime, target: number, isYank: boolean): VimRuntime {
  if (runtime.state.pendingOp === "none") {
    return setCursor(runtime, target);
  }
  if (runtime.state.pendingOp === "yank") {
    let yanked: string;
    if (isYank) {
      const cur = runtime.state.cursor;
      const e = wordEndN(runtime.state.text, cur, runtime.state.pendingCount || 1) + 1;
      yanked = runtime.state.text.slice(Math.min(cur, e), Math.max(cur, e));
    } else {
      yanked = runtime.state.text.slice(Math.min(runtime.state.cursor, target), Math.max(runtime.state.cursor, target));
    }
    return {
      state: { ...runtime.state, mode: "normal", pendingOp: "none", pendingCount: 0 },
      yank: { text: yanked, lineWise: false },
    };
  }
  if (runtime.state.pendingOp === "delete") {
    const r = applyDelete(runtime.state.text, runtime.state.cursor, target);
    return {
      state: { ...pushUndo({ ...runtime.state, text: r.text, cursor: r.cursor }), mode: "normal", pendingOp: "none", pendingCount: 0 },
      yank: { text: runtime.state.text.slice(Math.min(runtime.state.cursor, target), Math.max(runtime.state.cursor, target)), lineWise: false },
    };
  }
  if (runtime.state.pendingOp === "change") {
    const r = applyDelete(runtime.state.text, runtime.state.cursor, target);
    return {
      state: { ...pushUndo({ ...runtime.state, text: r.text, cursor: r.cursor }), mode: "insert", pendingOp: "none", pendingCount: 0 },
      yank: { text: runtime.state.text.slice(Math.min(runtime.state.cursor, target), Math.max(runtime.state.cursor, target)), lineWise: false },
    };
  }
  return runtime;
}

function lineStart(text: string, cursor: number): number {
  return text.lastIndexOf("\n", cursor - 1) + 1;
}

function lineEndN(text: string, cursor: number, n: number): number {
  let pos = cursor;
  for (let i = 0; i < n; i++) {
    const end = text.indexOf("\n", pos);
    if (end === -1) return text.length;
    pos = end + 1;
    if (i < n - 1) pos = lineStart(text, pos) + (text.indexOf("\n", pos) === -1 ? text.length - lineStart(text, pos) : 0);
  }
  const next = text.indexOf("\n", pos - 1);
  if (next === -1) return text.length;
  return next;
}

function lineUp(text: string, cursor: number, n: number): number {
  let pos = cursor;
  for (let i = 0; i < n; i++) {
    const col = pos - lineStart(text, pos);
    const prev = text.lastIndexOf("\n", pos - 1);
    if (prev === -1) return 0;
    const prevLineStart = prev + 1;
    const prevLineEnd = text.indexOf("\n", prevLineStart);
    pos = prevLineStart + Math.min(col, (prevLineEnd === -1 ? text.length : prevLineEnd) - prevLineStart);
  }
  return pos;
}

function lineDown(text: string, cursor: number, n: number): number {
  let pos = cursor;
  for (let i = 0; i < n; i++) {
    const col = pos - lineStart(text, pos);
    const end = text.indexOf("\n", pos);
    if (end === -1) return text.length;
    const nextLineStart = end + 1;
    const nextLineEnd = text.indexOf("\n", nextLineStart);
    pos = nextLineStart + Math.min(col, (nextLineEnd === -1 ? text.length : nextLineEnd) - nextLineStart);
  }
  return pos;
}

function applyLineDeleteN(text: string, cursor: number, n: number): { text: string; cursor: number; yanked: string } {
  let r = applyLineDelete(text, cursor);
  let yanked = r.text.length < text.length ? text.slice(0, 0) : "";
  const startLineStart = lineStart(text, cursor);
  let endLineEnd = cursor;
  for (let i = 0; i < n; i++) {
    const nextEnd = text.indexOf("\n", endLineEnd);
    if (nextEnd === -1) {
      endLineEnd = text.length;
      break;
    }
    endLineEnd = nextEnd + 1;
  }
  yanked = text.slice(startLineStart, endLineEnd);
  return { text: text.slice(0, startLineStart) + text.slice(endLineEnd), cursor: startLineStart, yanked };
}

function applyLineYankN(text: string, cursor: number, n: number): { yanked: string } {
  let endLineEnd = cursor;
  for (let i = 0; i < n; i++) {
    const nextEnd = text.indexOf("\n", endLineEnd);
    if (nextEnd === -1) {
      endLineEnd = text.length;
      break;
    }
    endLineEnd = nextEnd + 1;
  }
  return { yanked: text.slice(lineStart(text, cursor), endLineEnd) };
}

function applyLineChangeN(text: string, cursor: number, n: number): { text: string; cursor: number; yanked: string } {
  let pos = cursor;
  let endOfLastLine = cursor;
  for (let i = 0; i < n; i++) {
    const end = text.indexOf("\n", pos);
    if (end === -1) {
      endOfLastLine = text.length;
      break;
    }
    endOfLastLine = end;
    pos = end + 1;
  }
  const lastLine = endOfLastLine === text.length;
  const deletedEnd = lastLine ? endOfLastLine : endOfLastLine;
  const yanked = text.slice(cursor, deletedEnd);
  let text2: string;
  let newCursor: number;
  if (lastLine && cursor > 0) {
    text2 = text.slice(0, cursor - 1) + text.slice(deletedEnd);
    newCursor = cursor - 1;
  } else {
    text2 = text.slice(0, cursor) + text.slice(deletedEnd);
    newCursor = cursor;
  }
  return { text: text2, cursor: newCursor, yanked };
}

export function handleVisualKey(input: string, key: Record<string, boolean>, runtime: VimRuntime): VimRuntime {
  if (key.escape || input === "v") {
    return { state: { ...runtime.state, mode: "normal", cursor: runtime.state.cursor, pendingOp: "none", pendingCount: 0 }, yank: runtime.yank };
  }
  if (input === "V") {
    const lineStart_ = lineStart(runtime.state.text, runtime.state.anchor);
    const lineEnd_ = lineEndN(runtime.state.text, runtime.state.cursor, 1);
    return { state: { ...runtime.state, mode: "visual", anchor: lineStart_, cursor: lineEnd_, pendingOp: "none", pendingCount: 0 }, yank: runtime.yank };
  }
  if (input === "d" || input === "x") {
    const start = Math.min(runtime.state.anchor, runtime.state.cursor);
    const end = Math.max(runtime.state.anchor, runtime.state.cursor);
    const yanked = runtime.state.text.slice(start, end);
    return withUndo(runtime, (s) => ({ ...s, text: s.text.slice(0, start) + s.text.slice(end), cursor: start, mode: "normal" }));
  }
  if (input === "y") {
    const start = Math.min(runtime.state.anchor, runtime.state.cursor);
    const end = Math.max(runtime.state.anchor, runtime.state.cursor);
    const yanked = runtime.state.text.slice(start, end);
    return { state: { ...runtime.state, mode: "normal", cursor: start, pendingOp: "none", pendingCount: 0 }, yank: { text: yanked, lineWise: false } };
  }
  if (input === "c") {
    const start = Math.min(runtime.state.anchor, runtime.state.cursor);
    const end = Math.max(runtime.state.anchor, runtime.state.cursor);
    const yanked = runtime.state.text.slice(start, end);
    return withUndo(runtime, (s) => ({ ...s, text: s.text.slice(0, start) + s.text.slice(end), cursor: start, mode: "insert" }));
  }
  if (input === "h" || input === "l" || input === "w" || input === "b" || input === "e" || input === "0" || input === "$") {
    const motionRuntime: VimRuntime = { ...runtime, state: { ...runtime.state, mode: "normal" } };
    const next = handleNormalKey(input, key, motionRuntime);
    let endCursor = next.state.cursor;
    if (next.state.cursor !== runtime.state.cursor) {
      return { state: { ...next.state, mode: "visual", cursor: endCursor }, yank: next.yank };
    }
    return { ...runtime, state: { ...next.state, mode: "visual", cursor: endCursor } };
  }
  return runtime;
}

export function handleKey(input: string, key: Record<string, boolean>, runtime: VimRuntime): VimRuntime {
  if (runtime.state.mode === "insert") return handleInsertKey(input, key, runtime);
  if (runtime.state.mode === "visual") return handleVisualKey(input, key, runtime);
  return handleNormalKey(input, key, runtime);
}

void makeResult;

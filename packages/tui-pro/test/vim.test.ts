import { describe, it, expect } from "vitest";
import {
  applyDelete,
  applyLineDelete,
  applyLineYank,
  applyLineChange,
  pasteAfter,
  pasteBefore,
  wordForwardN,
  wordBackwardN,
  wordEndN,
  pushUndo,
  clampCursor,
} from "../src/util/vim.js";

describe("applyDelete", () => {
  it("deletes a range", () => {
    const r = applyDelete("hello world", 5, 6);
    expect(r.text).toBe("helloworld");
    expect(r.cursor).toBe(5);
  });

  it("deletes a multi-char range", () => {
    const r = applyDelete("hello world", 0, 6);
    expect(r.text).toBe("world");
    expect(r.cursor).toBe(0);
  });

  it("handles empty range", () => {
    const r = applyDelete("hello", 2, 2);
    expect(r.text).toBe("hello");
    expect(r.cursor).toBe(2);
  });
});

describe("applyLineDelete", () => {
  it("deletes the current line", () => {
    const r = applyLineDelete("foo\nbar\nbaz", 4);
    expect(r.text).toBe("foo\nbaz");
    expect(r.cursor).toBe(4);
  });

  it("deletes the only line", () => {
    const r = applyLineDelete("hello", 2);
    expect(r.text).toBe("");
    expect(r.cursor).toBe(0);
  });

  it("deletes the last line, removes preceding newline", () => {
    const r = applyLineDelete("foo\nbar", 4);
    expect(r.text).toBe("foo");
    expect(r.cursor).toBe(3);
  });
});

describe("applyLineYank", () => {
  it("yanks the current line including newline", () => {
    const r = applyLineYank("foo\nbar\nbaz", 0);
    expect(r.yanked).toBe("foo\n");
  });

  it("yanks the only line without trailing newline", () => {
    const r = applyLineYank("hello", 0);
    expect(r.yanked).toBe("hello");
  });
});

describe("applyLineChange", () => {
  it("changes the current line, keeps trailing newline", () => {
    const r = applyLineChange("foo\nbar\nbaz", 0);
    expect(r.text).toBe("\nbar\nbaz");
    expect(r.cursor).toBe(0);
    expect(r.yanked).toBe("foo");
  });

  it("changes the last line", () => {
    const r = applyLineChange("foo\nbar", 4);
    expect(r.text).toBe("foo");
    expect(r.yanked).toBe("bar");
  });
});

describe("pasteAfter", () => {
  it("pastes after cursor (char-wise, vim semantics)", () => {
    const r = pasteAfter("hello world", 4, "X", false);
    expect(r.text).toBe("helloX world");
    expect(r.cursor).toBe(5);
  });

  it("pastes after cursor (line-wise)", () => {
    const r = pasteAfter("foo\nbar", 3, "baz\n", true);
    expect(r.text).toBe("foo\nbaz\nbar");
  });
});

describe("pasteBefore", () => {
  it("pastes before cursor (char-wise)", () => {
    const r = pasteBefore("hello", 2, "X", false);
    expect(r.text).toBe("heXllo");
  });

  it("pastes before cursor (line-wise)", () => {
    const r = pasteBefore("foo\nbar", 0, "X\n", true);
    expect(r.text).toBe("X\nfoo\nbar");
  });
});

describe("wordForwardN", () => {
  it("advances one word", () => {
    expect(wordForwardN("hello world", 0, 1)).toBe(6);
  });

  it("advances N words", () => {
    expect(wordForwardN("foo bar baz qux", 0, 3)).toBe(12);
  });

  it("returns end when no more words", () => {
    expect(wordForwardN("hello", 0, 5)).toBe(5);
  });

  it("treats underscore as word char", () => {
    expect(wordForwardN("foo_bar baz", 0, 1)).toBe(8);
  });
});

describe("wordBackwardN", () => {
  it("goes back one word", () => {
    expect(wordBackwardN("hello world", 11, 1)).toBe(6);
  });

  it("goes back N words", () => {
    expect(wordBackwardN("a b c d e", 9, 3)).toBe(4);
  });

  it("returns 0 at start", () => {
    expect(wordBackwardN("hello", 5, 3)).toBe(0);
  });
});

describe("wordEndN", () => {
  it("end of current word when cursor on word", () => {
    expect(wordEndN("hello world", 0, 1)).toBe(4);
  });

  it("end of next word when cursor on whitespace", () => {
    expect(wordEndN("hello   world", 5, 1)).toBe(12);
  });

  it("end of Nth word from word start", () => {
    expect(wordEndN("foo bar baz", 0, 2)).toBe(6);
  });

  it("advances from end of word to end of next word", () => {
    expect(wordEndN("foo bar baz", 2, 1)).toBe(6);
  });
});

describe("pushUndo", () => {
  it("pushes current state", () => {
    const s = { text: "abc", cursor: 1, anchor: 1, mode: "insert" as const, pendingOp: "none" as const, pendingCount: 0, undoStack: [] };
    const next = pushUndo(s);
    expect(next.undoStack).toHaveLength(1);
    expect(next.undoStack[0]).toEqual({ text: "abc", cursor: 1 });
  });
});

describe("clampCursor", () => {
  it("clamps to 0", () => {
    expect(clampCursor("hello", -5)).toBe(0);
  });

  it("clamps to length", () => {
    expect(clampCursor("hello", 100)).toBe(5);
  });

  it("preserves valid", () => {
    expect(clampCursor("hello", 3)).toBe(3);
  });
});

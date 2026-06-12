import { describe, it, expect } from "vitest";
import {
  handleKey,
  handleInsertKey,
  handleNormalKey,
  handleVisualKey,
  INITIAL_RUNTIME,
  type VimRuntime,
} from "../src/index.js";

function runKeys(runtime: VimRuntime, keys: Array<[string, Record<string, boolean>]>): VimRuntime {
  let r = runtime;
  for (const [input, key] of keys) {
    r = handleKey(input, key, r);
  }
  return r;
}

function k(input: string, key: Record<string, boolean> = {}): [string, Record<string, boolean>] {
  return [input, key];
}

function inInsert(s: string): VimRuntime {
  return {
    ...INITIAL_RUNTIME,
    state: { ...INITIAL_RUNTIME.state, text: s, cursor: s.length, mode: "insert" },
  };
}

function inNormal(s: string): VimRuntime {
  const r = inInsert(s);
  return handleKey("", { escape: true }, r);
}

describe("handleKey — insert mode", () => {
  it("inserts characters at cursor", () => {
    const r = runKeys(INITIAL_RUNTIME, [k("a"), k("b"), k("c")]);
    expect(r.state.text).toBe("abc");
    expect(r.state.cursor).toBe(3);
  });

  it("esc enters normal mode", () => {
    const r = runKeys(INITIAL_RUNTIME, [k("a"), k("", { escape: true })]);
    expect(r.state.mode).toBe("normal");
  });

  it("backspace removes char before cursor", () => {
    const r = runKeys(INITIAL_RUNTIME, [k("a"), k("b"), k("c"), k("", { backspace: true })]);
    expect(r.state.text).toBe("ab");
    expect(r.state.cursor).toBe(2);
  });

  it("enter inserts newline", () => {
    const r = runKeys(INITIAL_RUNTIME, [k("a"), k("", { return: true }), k("b")]);
    expect(r.state.text).toBe("a\nb");
    expect(r.state.cursor).toBe(3);
  });
});

describe("handleKey — normal mode movements", () => {
  it("h moves cursor left", () => {
    const r = runKeys(inNormal("abc"), [k("h")]);
    expect(r.state.cursor).toBe(1);
  });

  it("l moves cursor right", () => {
    const r = runKeys(inNormal("abc"), [k("0"), k("l")]);
    expect(r.state.cursor).toBe(1);
  });

  it("0 goes to start", () => {
    const r = runKeys(inNormal("abc"), [k("$"), k("0")]);
    expect(r.state.cursor).toBe(0);
  });

  it("$ goes to end", () => {
    const r = runKeys(inNormal("abc"), [k("0"), k("$")]);
    expect(r.state.cursor).toBe(3);
  });

  it("w moves to next word", () => {
    const r = runKeys(inNormal("hello world"), [k("0"), k("w")]);
    expect(r.state.cursor).toBe(6);
  });

  it("b moves to previous word", () => {
    const r = runKeys(inNormal("hello world"), [k("0"), k("w"), k("b")]);
    expect(r.state.cursor).toBe(0);
  });

  it("e moves to end of word", () => {
    const r = runKeys(inNormal("hello world"), [k("0"), k("e")]);
    expect(r.state.cursor).toBe(4);
  });

  it("count prefix works (3w from start)", () => {
    const r = runKeys(inNormal("foo bar baz qux"), [k("0"), k("3"), k("w")]);
    expect(r.state.cursor).toBe(12);
  });

  it("i enters insert mode at cursor", () => {
    const r = runKeys(inNormal("abc"), [k("0"), k("i"), k("X")]);
    expect(r.state.text).toBe("Xabc");
  });

  it("a enters insert mode after cursor", () => {
    const r = runKeys(inNormal("abc"), [k("0"), k("a"), k("X")]);
    expect(r.state.text).toBe("aXbc");
  });

  it("A enters insert at end of line", () => {
    const r = runKeys(inNormal("abc"), [k("0"), k("A"), k("X")]);
    expect(r.state.text).toBe("abcX");
  });
});

describe("handleKey — delete operations", () => {
  it("x deletes char at cursor", () => {
    const r = runKeys(inNormal("abc"), [k("0"), k("l"), k("x")]);
    expect(r.state.text).toBe("ac");
  });

  it("dw deletes word", () => {
    const r = runKeys(inNormal("hello world"), [k("0"), k("d"), k("w")]);
    expect(r.state.text).toBe("world");
  });

  it("dd deletes first line", () => {
    let r = inNormal("foo\nbar\nbaz");
    r = handleKey("0", {}, r);
    r = runKeys(r, [k("d"), k("d")]);
    expect(r.state.text).toBe("bar\nbaz");
  });

  it("3dd deletes 3 lines from start", () => {
    let r = inNormal("a\nb\nc\nd");
    r = handleKey("0", {}, r);
    r = runKeys(r, [k("3"), k("d"), k("d")]);
    expect(r.state.text).toBe("d");
  });
});

describe("handleKey — change operations", () => {
  it("cw changes word", () => {
    const r = runKeys(inNormal("hello world"), [k("0"), k("c"), k("w")]);
    expect(r.state.text).toBe("world");
    expect(r.state.mode).toBe("insert");
  });

  it("cc on first line keeps trailing \\n", () => {
    let r = inNormal("foo\nbar\nbaz");
    r = handleKey("0", {}, r);
    r = runKeys(r, [k("c"), k("c")]);
    expect(r.state.text).toBe("\nbar\nbaz");
    expect(r.state.mode).toBe("insert");
  });
});

describe("handleKey — yank and paste", () => {
  it("yw from start yanks first word", () => {
    let r = inNormal("hello world");
    r = handleKey("0", {}, r);
    r = runKeys(r, [k("y"), k("w")]);
    expect(r.yank?.text).toBe("hello");
  });

  it("yy yanks line (first line)", () => {
    let r = inNormal("foo\nbar");
    r = handleKey("0", {}, r);
    r = runKeys(r, [k("y"), k("y")]);
    expect(r.yank?.text).toBe("foo\n");
  });

  it("p pastes yanked text", () => {
    let r = inNormal("hello world");
    r = handleKey("0", {}, r);
    r = runKeys(r, [k("y"), k("w")]);
    r = runKeys(r, [k("0"), k("p")]);
    expect(r.state.text).toContain("hello");
  });
});

describe("handleKey — undo", () => {
  it("u undoes last insert", () => {
    let r = inInsert("");
    r = runKeys(r, [k("a"), k("b"), k("c")]);
    r = runKeys(r, [k("", { escape: true })]);
    r = runKeys(r, [k("u")]);
    expect(r.state.text).toBe("ab");
  });
});

describe("handleKey — visual mode", () => {
  it("v enters visual mode", () => {
    const r = runKeys(inNormal("hello"), [k("v")]);
    expect(r.state.mode).toBe("visual");
  });

  it("v again exits visual mode", () => {
    const r = runKeys(inNormal("hello"), [k("v"), k("v")]);
    expect(r.state.mode).toBe("normal");
  });

  it("d in visual mode deletes selection (word + trailing space)", () => {
    const r = runKeys(inNormal("hello world"), [k("0"), k("v"), k("w"), k("d")]);
    expect(r.state.text).toBe("world");
  });

  it("y in visual mode yanks selection (word + trailing space)", () => {
    const r = runKeys(inNormal("hello world"), [k("0"), k("v"), k("w"), k("y")]);
    expect(r.yank?.text).toBe("hello ");
  });
});

describe("handleInsertKey / handleNormalKey / handleVisualKey are exported", () => {
  it("handleInsertKey is a function", () => {
    expect(typeof handleInsertKey).toBe("function");
  });
  it("handleNormalKey is a function", () => {
    expect(typeof handleNormalKey).toBe("function");
  });
  it("handleVisualKey is a function", () => {
    expect(typeof handleVisualKey).toBe("function");
  });
});

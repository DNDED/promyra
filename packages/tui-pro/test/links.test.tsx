import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { StreamingText, parseLinks } from "../src/index.js";

describe("parseLinks — HTTP/HTTPS URLs", () => {
  it("detects http url", () => {
    const out = parseLinks("see https://example.com for more");
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ type: "text", content: "see " });
    expect(out[1]).toEqual({ type: "url", href: "https://example.com", content: "https://example.com" });
    expect(out[2]).toEqual({ type: "text", content: " for more" });
  });

  it("detects multiple URLs", () => {
    const out = parseLinks("https://a.com and https://b.com");
    expect(out.filter(s => s.type === "url")).toHaveLength(2);
  });

  it("detects url with path and query", () => {
    const out = parseLinks("see https://api.example.com/v1/users?limit=10");
    const urlSeg = out.find(s => s.type === "url");
    expect(urlSeg).toBeDefined();
    if (urlSeg?.type === "url") expect(urlSeg.content).toContain("api.example.com/v1/users?limit=10");
  });

  it("handles text with no URLs", () => {
    const out = parseLinks("plain text only");
    expect(out).toEqual([{ type: "text", content: "plain text only" }]);
  });

  it("handles empty string", () => {
    expect(parseLinks("")).toEqual([]);
  });
});

describe("parseLinks — file:// URLs", () => {
  it("detects file:// url", () => {
    const out = parseLinks("open file:///etc/hosts");
    expect(out).toHaveLength(2);
    expect(out[1]?.type).toBe("url");
    if (out[1]?.type === "url") expect(out[1].href).toBe("file:///etc/hosts");
  });
});

describe("parseLinks — file:line refs", () => {
  it("detects ts file with line", () => {
    const out = parseLinks("see src/auth.ts:42 for the bug");
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ type: "text", content: "see " });
    expect(out[1]?.type).toBe("url");
    if (out[1]?.type === "url") {
      expect(out[1].content).toBe("src/auth.ts:42");
      expect(out[1].href).toMatch(/^file:\/\/.*\/src\/auth\.ts#L42$/);
    }
    expect(out[2]).toEqual({ type: "text", content: " for the bug" });
  });

  it("detects python file with line", () => {
    const out = parseLinks("see src/auth.py:100");
    const urlSeg = out.find(s => s.type === "url");
    expect(urlSeg).toBeDefined();
  });

  it("detects multiple file:line refs", () => {
    const out = parseLinks("src/a.ts:1 and src/b.ts:2");
    expect(out.filter(s => s.type === "url")).toHaveLength(2);
  });

  it("ignores invalid extensions", () => {
    const out = parseLinks("see foo.txt:42 (txt not a code file)");
    expect(out[0]?.type).toBe("text");
  });

  it("ignores numbers without colons", () => {
    const out = parseLinks("the value 42 is here");
    expect(out[0]?.type).toBe("text");
  });
});

describe("parseLinks — overlapping matches", () => {
  it("URL takes precedence over file:line inside it", () => {
    const out = parseLinks("https://example.com/path/file.ts:42");
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe("url");
  });
});

describe("StreamingText with links", () => {
  it("renders plain text unchanged", () => {
    const { lastFrame } = render(<StreamingText text="hello world" />);
    expect(lastFrame()).toBe("hello world");
  });

  it("renders URL inline (no separator for short text)", () => {
    const { lastFrame } = render(<StreamingText text="see https://example.com" />);
    const out = lastFrame();
    expect(out).toContain("https://example.com");
  });

  it("renders file:line ref", () => {
    const { lastFrame } = render(<StreamingText text="see src/auth.ts:42" />);
    expect(lastFrame()).toContain("src/auth.ts:42");
  });

  it("preserves custom color for plain text", () => {
    const { lastFrame } = render(<StreamingText text="hello" color="#abcdef" />);
    expect(lastFrame()).toBe("hello");
  });

  it("renders mixed text + url", () => {
    const { lastFrame } = render(<StreamingText text="check https://example.com for docs" />);
    expect(lastFrame()).toContain("check ");
    expect(lastFrame()).toContain("https://example.com");
    expect(lastFrame()).toContain(" for docs");
  });
});

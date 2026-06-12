import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { PromptInput } from "../src/index.js";

describe("PromptInput — ex mode UI", () => {
  it("renders the text input in insert mode", () => {
    const { lastFrame } = render(<PromptInput value="" onChange={() => {}} onSubmit={() => {}} />);
    const out = lastFrame();
    expect(out).toContain("-- INSERT --");
  });

  it("renders the normal mode badge when initialMode='normal'", () => {
    const { lastFrame } = render(<PromptInput value="hello" onChange={() => {}} onSubmit={() => {}} initialMode="normal" />);
    expect(lastFrame()).toContain("-- NORMAL --");
  });

  it("shows normal mode hint with `:` ex command", () => {
    const { lastFrame } = render(<PromptInput value="" onChange={() => {}} onSubmit={() => {}} initialMode="normal" />);
    const out = lastFrame();
    expect(out).toContain("::ex");
  });

  it("does not render ex mode UI in insert mode", () => {
    const { lastFrame } = render(<PromptInput value="hello" onChange={() => {}} onSubmit={() => {}} />);
    const out = lastFrame();
    expect(out).not.toContain("-- EX --");
    expect(out).not.toContain("write");
  });
});

describe("PromptInput — hint lines", () => {
  it("normal hint mentions common motions", () => {
    const { lastFrame } = render(<PromptInput value="" onChange={() => {}} onSubmit={() => {}} initialMode="normal" />);
    const out = lastFrame();
    expect(out).toContain("h/l:move");
    expect(out).toContain("w/b:word");
    expect(out).toContain("0/$:line");
  });

  it("visual hint mentions delete and yank", () => {
    const { lastFrame } = render(<PromptInput value="hello" onChange={() => {}} onSubmit={() => {}} initialMode="visual" />);
    const out = lastFrame();
    expect(out).toContain("d:delete");
    expect(out).toContain("y:yank");
  });
});

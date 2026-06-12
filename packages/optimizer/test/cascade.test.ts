import { describe, it, expect } from "vitest";
import { classifyToolForCascade, resolveCascade, groupForParallel, type ToolCall } from "../src/cascade.js";

describe("classifyToolForCascade", () => {
  it("classifies read tools as cheap", () => {
    expect(classifyToolForCascade("grep")).toBe("cheap");
    expect(classifyToolForCascade("glob")).toBe("cheap");
    expect(classifyToolForCascade("read")).toBe("cheap");
    expect(classifyToolForCascade("ls")).toBe("cheap");
    expect(classifyToolForCascade("git status")).toBe("cheap");
    expect(classifyToolForCascade("git diff")).toBe("cheap");
  });

  it("classifies web tools as cheap", () => {
    expect(classifyToolForCascade("web fetch")).toBe("cheap");
    expect(classifyToolForCascade("web search")).toBe("cheap");
  });

  it("classifies write/edit tools as main", () => {
    expect(classifyToolForCascade("edit")).toBe("main");
    expect(classifyToolForCascade("write")).toBe("main");
    expect(classifyToolForCascade("apply_patch")).toBe("main");
    expect(classifyToolForCascade("multiedit")).toBe("main");
  });

  it("classifies bash as main (test interpretation matters)", () => {
    expect(classifyToolForCascade("bash")).toBe("main");
  });

  it("classifies task (subagent dispatch) as main", () => {
    expect(classifyToolForCascade("task")).toBe("main");
  });

  it("defaults unknown tools to main (safe)", () => {
    expect(classifyToolForCascade("unknown_tool_xyz")).toBe("main");
  });

  it("is case-insensitive", () => {
    expect(classifyToolForCascade("GREP")).toBe("cheap");
    expect(classifyToolForCascade("Edit")).toBe("main");
  });
});

describe("resolveCascade", () => {
  it("returns main model for main-classified tools", () => {
    const r = resolveCascade("edit", "opencode-go", "deepseek-v4-pro");
    expect(r.decision).toBe("main");
    expect(r.model).toBe("deepseek-v4-pro");
  });

  it("returns cheap model for cheap-classified tools", () => {
    const r = resolveCascade("grep", "anthropic", "claude-sonnet-4-5");
    expect(r.decision).toBe("cheap");
    expect(r.model).toBe("claude-haiku-4-5");
  });
});

describe("groupForParallel", () => {
  it("returns single empty batch for empty input", () => {
    expect(groupForParallel([])).toEqual([[]]);
  });

  it("returns single batch for single call", () => {
    const calls: ToolCall[] = [{ id: "1", name: "read", args: {} }];
    const groups = groupForParallel(calls);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(calls);
  });

  it("returns single batch for multiple independent calls", () => {
    const calls: ToolCall[] = [
      { id: "1", name: "read", args: { path: "a" } },
      { id: "2", name: "read", args: { path: "b" } },
    ];
    const groups = groupForParallel(calls);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(calls);
  });
});

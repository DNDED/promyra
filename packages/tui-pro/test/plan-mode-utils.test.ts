import { describe, it, expect } from "vitest";
import {
  isSafeCommand,
  cleanStepText,
  extractTodoItems,
  extractDoneSteps,
  markCompletedSteps,
  countProgress,
  type PlanTodo,
} from "../src/extensions/plan-mode-utils.js";

describe("isSafeCommand", () => {
  it("allows read-only commands", () => {
    expect(isSafeCommand("ls -la")).toBe(true);
    expect(isSafeCommand("cat README.md")).toBe(true);
    expect(isSafeCommand("grep -r foo src/")).toBe(true);
    expect(isSafeCommand("git status")).toBe(true);
  });

  it("blocks destructive commands", () => {
    expect(isSafeCommand("rm -rf /")).toBe(false);
    expect(isSafeCommand("rm file.txt")).toBe(false);
    expect(isSafeCommand("sudo apt update")).toBe(false);
    expect(isSafeCommand("git push origin master")).toBe(false);
    expect(isSafeCommand("npm install lodash")).toBe(false);
    expect(isSafeCommand("vim foo.txt")).toBe(false);
  });

  it("rejects empty", () => {
    expect(isSafeCommand("")).toBe(false);
  });
});

describe("cleanStepText", () => {
  it("strips bold/italic", () => {
    expect(cleanStepText("**Hello** world")).toBe("Hello world");
    expect(cleanStepText("*emph* text")).toBe("Emph text");
  });

  it("strips code backticks", () => {
    expect(cleanStepText("Run `npm test` now")).toBe("Npm test now");
  });

  it("strips leading verb", () => {
    expect(cleanStepText("Execute the plan")).toBe("Plan");
  });

  it("truncates to 50 chars", () => {
    const long = "a".repeat(60);
    expect(cleanStepText(long).length).toBeLessThanOrEqual(50);
  });
});

describe("extractTodoItems", () => {
  it("parses a Plan: section", () => {
    const msg = `
Some intro.

Plan:
1. First step description
2. Second step description
3. Third step description

End.`;
    const items = extractTodoItems(msg);
    expect(items.length).toBe(3);
    expect(items[0]?.text).toContain("First step");
    expect(items[1]?.text).toContain("Second step");
    expect(items[2]?.text).toContain("Third step");
  });

  it("returns empty when no Plan: section", () => {
    expect(extractTodoItems("no plan here").length).toBe(0);
  });

  it("uses period or paren for numbering", () => {
    const msg = "Plan:\n1) one\n2) two";
    const items = extractTodoItems(msg);
    expect(items.length).toBe(2);
  });
});

describe("extractDoneSteps", () => {
  it("parses [DONE:n] markers", () => {
    const text = "Step one [DONE:1] then step two [DONE:2]";
    expect(extractDoneSteps(text)).toEqual([1, 2]);
  });

  it("deduplicates", () => {
    const text = "[DONE:1] [DONE:1] [DONE:2]";
    expect(extractDoneSteps(text)).toEqual([1, 1, 2]);
  });

  it("returns empty for no markers", () => {
    expect(extractDoneSteps("no markers here")).toEqual([]);
  });
});

describe("markCompletedSteps", () => {
  it("marks items as completed", () => {
    const items: PlanTodo[] = [
      { step: 1, text: "one", completed: false },
      { step: 2, text: "two", completed: false },
    ];
    const count = markCompletedSteps("[DONE:1]", items);
    expect(count).toBe(1);
    expect(items[0]?.completed).toBe(true);
    expect(items[1]?.completed).toBe(false);
  });
});

describe("countProgress", () => {
  it("counts done/total", () => {
    const items: PlanTodo[] = [
      { step: 1, text: "one", completed: true },
      { step: 2, text: "two", completed: false },
      { step: 3, text: "three", completed: true },
    ];
    expect(countProgress(items)).toEqual({ done: 2, total: 3 });
  });
});

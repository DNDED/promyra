import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { PlanModeWidget } from "../src/index.js";

describe("PlanModeWidget", () => {
  it("renders nothing when items empty", () => {
    const { lastFrame } = render(<PlanModeWidget items={[]} />);
    expect(lastFrame()).toBe("");
  });

  it("renders nothing when visible=false", () => {
    const items = [{ step: 1, text: "one", completed: false }];
    const { lastFrame } = render(<PlanModeWidget items={items} visible={false} />);
    expect(lastFrame()).toBe("");
  });

  it("renders progress header with done/total", () => {
    const items = [
      { step: 1, text: "First step", completed: true },
      { step: 2, text: "Second step", completed: false },
    ];
    const { lastFrame } = render(<PlanModeWidget items={items} />);
    const out = lastFrame();
    expect(out).toContain("Plan");
    expect(out).toContain("1/2");
    expect(out).toContain("First step");
    expect(out).toContain("Second step");
  });

  it("shows checkboxes (☑ for done, ☐ for pending)", () => {
    const items = [
      { step: 1, text: "Done item", completed: true },
      { step: 2, text: "Pending item", completed: false },
    ];
    const { lastFrame } = render(<PlanModeWidget items={items} />);
    const out = lastFrame();
    expect(out).toContain("☑");
    expect(out).toContain("☐");
  });

  it("shows all-done badge when complete", () => {
    const items = [
      { step: 1, text: "one", completed: true },
      { step: 2, text: "two", completed: true },
    ];
    const { lastFrame } = render(<PlanModeWidget items={items} />);
    expect(lastFrame()).toContain("all done");
  });
});

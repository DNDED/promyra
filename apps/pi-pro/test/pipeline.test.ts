import { describe, it, expect } from "vitest";
import { PipelineWorker } from "@pi/subagent";
import { createProvider } from "@pi/provider";
import { createBashTool, createReadTool, createGrepTool, createGlobTool } from "@pi/tools";

describe("pi pipeline", () => {
  it("PipelineWorker.default constructs without args", () => {
    const provider = createProvider({ apiKey: "sk-test", defaultModel: "minimax-m3" });
    const tools = [
      createBashTool({ cwd: process.cwd() }),
      createReadTool({ cwd: process.cwd() }),
      createGrepTool({ cwd: process.cwd() }),
      createGlobTool({ cwd: process.cwd() }),
    ];
    const worker = PipelineWorker.default(provider, tools as never, process.cwd());
    expect(worker).toBeInstanceOf(PipelineWorker);
  });

  it("PipelineWorker can be constructed with explicit stages", () => {
    const provider = createProvider({ apiKey: "sk-test", defaultModel: "minimax-m3" });
    const tools: never[] = [];
    const customStages = {
      analyze: { name: "analyze", role: "build", model: "minimax-m3", maxTools: 4, maxIterations: 3, allowedTools: ["read", "grep"] },
    };
    const worker = new PipelineWorker(provider, tools, process.cwd(), customStages);
    expect(worker).toBeInstanceOf(PipelineWorker);
  });

  it("PipelineWorker accepts modelMap", () => {
    const provider = createProvider({ apiKey: "sk-test", defaultModel: "minimax-m3" });
    const worker = PipelineWorker.default(provider, [], process.cwd(), { analyze: "deepseek-v4-flash" });
    expect(worker).toBeInstanceOf(PipelineWorker);
  });

  it("PipelineWorker accepts qualityThreshold + maxRefineLoops", () => {
    const provider = createProvider({ apiKey: "sk-test", defaultModel: "minimax-m3" });
    const worker = PipelineWorker.default(provider, [], process.cwd(), {}, { qualityThreshold: 22, maxRefineLoops: 3 });
    expect(worker).toBeInstanceOf(PipelineWorker);
  });
});

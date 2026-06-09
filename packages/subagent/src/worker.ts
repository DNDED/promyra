import { Role, StepContext, SubagentResult, Worker } from "./types.js";
import { buildPrompt } from "./roles/build.js";
import { testRunnerPrompt } from "./roles/test-runner.js";
import { codeReviewerPrompt } from "./roles/code-reviewer.js";
import { securityAuditorPrompt } from "./roles/security-auditor.js";

export function promptFor(role: Role, ctx: StepContext): string {
  switch (role) {
    case "build": return buildPrompt(ctx);
    case "test-runner": return testRunnerPrompt(ctx);
    case "code-reviewer": return codeReviewerPrompt(ctx);
    case "security-auditor": return securityAuditorPrompt(ctx);
  }
}

/** A stub Worker that produces a pass result. The real impl in PR 6 wires this to a model call. */
export class StubWorker implements Worker {
  async run(role: Role, context: StepContext, prompt: string): Promise<SubagentResult> {
    const start = Date.now();
    return {
      role,
      stepId: context.stepId,
      status: "pass",
      evidence: `Stub ${role} execution for step ${context.stepId}.`,
      tokensIn: prompt.length,
      tokensOut: 16,
      durationMs: Date.now() - start,
    };
  }
}

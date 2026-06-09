import { z } from "zod";

export const RoleSchema = z.enum(["build", "test-runner", "code-reviewer", "security-auditor"]);
export type Role = z.infer<typeof RoleSchema>;

export const StepContextSchema = z.object({
  taskId: z.string(),
  stepId: z.string(),
  description: z.string(),
  worktreePath: z.string().optional(),
  diff: z.string().optional(),
});
export type StepContext = z.infer<typeof StepContextSchema>;

export const SubagentResultSchema = z.object({
  role: RoleSchema,
  stepId: z.string(),
  status: z.enum(["pass", "fail", "blocked"]),
  evidence: z.string(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});
export type SubagentResult = z.infer<typeof SubagentResultSchema>;

export type Tool = "bash" | "read" | "write" | "edit" | "grep" | "glob" | "webfetch";

export interface Worker {
  run(role: Role, context: StepContext, prompt: string): Promise<SubagentResult>;
}

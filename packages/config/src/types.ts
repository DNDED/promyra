import { z } from "zod";

export const AgentModeSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  activeTools: z.array(z.string()).default([]),
  bashAllowlist: z.array(z.instanceof(RegExp)).optional(),
  systemPromptAppend: z.string().optional(),
  readOnly: z.boolean().default(false),
});
export type AgentMode = z.infer<typeof AgentModeSchema>;

export const PiConfigSchema = z.object({
  version: z.literal(1),
  provider: z.object({
    name: z.string().min(1),
    model: z.string().min(1),
    baseUrl: z.string().optional(),
  }),
  agent: z.object({
    name: z.string().min(1),
    maxIterations: z.number().int().positive(),
    toolBudget: z.number().int().positive(),
  }),
  theme: z.object({
    name: z.string().min(1),
  }),
  ui: z
    .object({
      statusLine: z.boolean().default(true),
      copyFriendly: z.boolean().default(false),
      nerdFonts: z.boolean().default(true),
      gitStatusIntervalMs: z.number().int().nonnegative().default(5000),
    })
    .default({
      statusLine: true,
      copyFriendly: false,
      nerdFonts: true,
      gitStatusIntervalMs: 5000,
    }),
  modes: z.array(AgentModeSchema).optional(),
});
export type PiConfig = z.infer<typeof PiConfigSchema>;

export type ValidationResult =
  | { ok: true; config: PiConfig }
  | { ok: false; errors: string[] };

export function validateConfig(input: unknown): ValidationResult {
  const result = PiConfigSchema.safeParse(input);
  if (result.success) return { ok: true, config: result.data as PiConfig };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

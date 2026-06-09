import { z } from "zod";

export const CheckpointSchema = z.object({
  id: z.string().regex(/^chk_\d{6,}$/),
  taskId: z.string().regex(/^tsk_[a-z0-9]{8,}$/),
  state: z.enum(["intake", "plan", "branch", "execute", "verify", "summarize", "done"]),
  gitTreeSha: z.string().min(7),
  createdAt: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

import { z } from "zod";

export const AgentLogDto = z.object({
  fanId: z.string().trim().min(1),
  mandateId: z.string().trim().min(1),
  tool: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  txHash: z.string().trim().min(1).optional(),
});
export type AgentLogDto = z.infer<typeof AgentLogDto>;

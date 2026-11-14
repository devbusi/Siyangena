import { z } from "zod";

export const AgentRunDto = z.object({
  goal: z.enum(["buy", "resale", "sell"]),
  priceZar: z.coerce.number().positive().optional(),
});
export type AgentRunDto = z.infer<typeof AgentRunDto>;

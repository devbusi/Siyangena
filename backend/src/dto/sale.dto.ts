import { z } from "zod";

export const SaleIntentDto = z.object({
  fanId: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive(),
});
export type SaleIntentDto = z.infer<typeof SaleIntentDto>;

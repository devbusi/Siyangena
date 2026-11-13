import { z } from "zod";

export const PutMandateDto = z.object({
  quantity: z.coerce.number().int().positive(),
  ceilingZar: z.coerce.number().positive(),
});
export type PutMandateDto = z.infer<typeof PutMandateDto>;

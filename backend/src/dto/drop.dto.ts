import { z } from "zod";

export const CreateDropDto = z.object({
  name: z.string().trim().min(1),
  venue: z.string().trim().min(1),
  city: z.string().trim().optional(),
  scene: z.string().trim().optional(),
  posterUrl: z.string().trim().url().optional(),
  startsAt: z.string().trim().min(1),
  priceZar: z.coerce.number().positive(),
  supply: z.coerce.number().int().positive(),
  maxPerFan: z.coerce.number().int().positive(),
  resaleCapZar: z.coerce.number().positive(),
  resaleFeePct: z.coerce.number().min(0).max(100),
});
export type CreateDropDto = z.infer<typeof CreateDropDto>;

export const UpdateDropDto = z
  .object({
    resaleCapZar: z.coerce.number().positive().optional(),
    resaleFeePct: z.coerce.number().min(0).max(100).optional(),
    maxPerFan: z.coerce.number().int().positive().optional(),
  })
  .refine((v) => v.resaleCapZar !== undefined || v.resaleFeePct !== undefined || v.maxPerFan !== undefined, {
    message: "Send resaleCapZar, resaleFeePct and/or maxPerFan",
  });
export type UpdateDropDto = z.infer<typeof UpdateDropDto>;

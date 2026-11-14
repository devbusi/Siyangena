import { z } from "zod";
import { EVENT_CATEGORIES } from "@drop/shared";

export const CreateDropDto = z.object({
  name: z.string().trim().min(1),
  category: z.enum(EVENT_CATEGORIES).optional(),
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

// Changing an event's details while it's in review (the ticket supply is fixed on the ledger).
export const EditDropDto = z.object({
  name: z.string().trim().min(1).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  venue: z.string().trim().min(1).optional(),
  city: z.string().trim().optional(),
  scene: z.string().trim().optional(),
  posterUrl: z.string().trim().url().or(z.literal("")).optional(),
  startsAt: z.string().trim().min(1).optional(),
  priceZar: z.coerce.number().positive().optional(),
  maxPerFan: z.coerce.number().int().positive().optional(),
  resaleCapZar: z.coerce.number().positive().optional(),
  resaleFeePct: z.coerce.number().min(0).max(100).optional(),
  resubmit: z.boolean().optional(),
});
export type EditDropDto = z.infer<typeof EditDropDto>;

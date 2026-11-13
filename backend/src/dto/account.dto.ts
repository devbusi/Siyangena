import { z } from "zod";

export const ApplicationDto = z.object({
  kind: z.enum(["business", "independent"]),
  displayName: z.string().trim().min(2),
  registrationNumber: z.string().trim().optional(),
  pastEvents: z.string().trim().optional(),
  socials: z.string().trim().optional(),
  payoutDetails: z.string().trim().min(3),
});
export type ApplicationDto = z.infer<typeof ApplicationDto>;

export const ReviewDto = z.object({
  decision: z.enum(["approved", "needs_more", "rejected"]),
  note: z.string().trim().optional(),
});
export type ReviewDto = z.infer<typeof ReviewDto>;

export const RoleDto = z.object({ role: z.enum(["fan", "promoter", "admin"]) });

export const TopUpDto = z.object({ amountZar: z.coerce.number().positive().max(10000) });

export const BuyDto = z.object({ quantity: z.coerce.number().int().positive().max(10) });

export const ResellDto = z.object({ priceZar: z.coerce.number().positive() });

export const MeAgentDto = z.object({
  goal: z.enum(["buy", "resale", "sell"]),
  priceZar: z.coerce.number().positive().optional(),
});

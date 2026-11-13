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

export const WishDto = z.object({
  query: z.string().trim().min(2).max(120),
  city: z.string().trim().max(60).optional(),
  maxZar: z.coerce.number().positive().max(100000).optional(),
});
export type WishDto = z.infer<typeof WishDto>;

export const CancelDto = z.object({
  reason: z.string().trim().min(5).max(400),
  confirm: z.literal("CANCEL"),
});
export type CancelDto = z.infer<typeof CancelDto>;

export const CheckinDto = z.object({ code: z.string().trim().min(8).max(400) });

export const ProfileDto = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).optional(),
});

export const PromoterDetailsDto = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  registrationNumber: z.string().trim().max(40).optional(),
  payoutDetails: z.string().trim().min(3).max(200).optional(),
  socials: z.string().trim().max(200).optional(),
  pastEvents: z.string().trim().max(500).optional(),
});

export const ChangeReviewDto = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(300).optional(),
});

export const DepositDto = z.object({
  amountZar: z.coerce.number().positive().max(5000),
  method: z.enum(["card", "eft"]),
  cardNumber: z.string().trim().max(30).optional(),
  bank: z.string().trim().max(40).optional(),
});

export const CashOutDto = z.object({
  amountZar: z.coerce.number().positive().max(20000),
  bank: z.string().trim().min(2).max(40),
  accountNumber: z.string().trim().min(6).max(20),
});

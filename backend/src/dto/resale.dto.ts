import { z } from "zod";

export const CreateListingDto = z.object({
  fanId: z.string().trim().min(1),
  priceZar: z.coerce.number().positive(),
});
export type CreateListingDto = z.infer<typeof CreateListingDto>;

export const AcceptListingDto = z.object({
  buyerFanId: z.string().trim().min(1),
});
export type AcceptListingDto = z.infer<typeof AcceptListingDto>;

export const SubmitSignatureDto = z.object({
  fanId: z.string().trim().min(1),
  // Batch JSON from signMultiBatch, or its encoded blob.
  signedBatch: z.union([z.record(z.string(), z.unknown()), z.string().min(1)]),
});
export type SubmitSignatureDto = z.infer<typeof SubmitSignatureDto>;

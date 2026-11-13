import { Router, Request, Response } from "express";
import { Resale } from "../../../application-logic/resale-logic/Resale";
import { AcceptListingDto, CreateListingDto, SubmitSignatureDto } from "../../../dto/resale.dto";
import { validate } from "../../../middleware/validate";
import { sendError } from "../../../lib/utils/errors";

const router = Router();
const resaleService = new Resale();

router.get("/listings", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: resaleService.listListings() });
  } catch (error) {
    sendError(res, error, "Failed to fetch listings");
  }
});

router.post("/listings", validate(CreateListingDto), async (req: Request, res: Response) => {
  try {
    const { fanId, priceZar } = req.body as CreateListingDto;
    const listing = await resaleService.createListing(fanId, priceZar);
    res.status(201).json({ success: true, data: listing });
  } catch (error) {
    sendError(res, error, "Failed to create listing");
  }
});

// Returns the autofilled Batch for seller and buyer to sign, or 403 CAP_EXCEEDED / MANDATE_EXCEEDED.
router.post("/listings/:id/accept", validate(AcceptListingDto), async (req: Request, res: Response) => {
  try {
    const { buyerFanId } = req.body as AcceptListingDto;
    const result = await resaleService.acceptListing(req.params.id as string, buyerFanId);
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error, "Failed to accept listing");
  }
});

// The seller's agent fetches the Batch here after resale.sign_requested.
router.get("/batches/:batchId", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: resaleService.getBatch(req.params.batchId as string) });
  } catch (error) {
    sendError(res, error, "Failed to fetch batch");
  }
});

// When both have signed, the promoter checks the cap, signs last and submits.
router.post("/batches/:batchId/signatures", validate(SubmitSignatureDto), async (req: Request, res: Response) => {
  try {
    const { fanId, signedBatch } = req.body as SubmitSignatureDto;
    const result = await resaleService.submitSignature(req.params.batchId as string, fanId, signedBatch);
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error, "Failed to submit signature");
  }
});

export default router;

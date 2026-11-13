import { Router, Request, Response } from "express";
import { Sales } from "../../../application-logic/sale-logic/Sales";
import { SaleIntentDto } from "../../../dto/sale.dto";
import { validate } from "../../../middleware/validate";
import { sendError } from "../../../lib/utils/errors";

const router = Router();
const saleService = new Sales();

// POST /api/sales/intents: checks mandate, per-fan limit, supply. The agent then pays
// `payTo` itself with the returned memo; the sale watcher sends tickets or refunds.
router.post("/intents", validate(SaleIntentDto), async (req: Request, res: Response) => {
  try {
    const { fanId, quantity } = req.body as SaleIntentDto;
    const intent = await saleService.createIntent(fanId, quantity);
    res.status(201).json({ success: true, data: intent });
  } catch (error) {
    sendError(res, error, "Failed to create sale intent");
  }
});

export default router;

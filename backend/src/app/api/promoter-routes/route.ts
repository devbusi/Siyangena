import { Router, Request, Response } from "express";
import { Drop } from "../../../application-logic/drop-logic/Drop";
import { CreateDropDto, UpdateDropDto } from "../../../dto/drop.dto";
import { validate } from "../../../middleware/validate";
import { requireHuman } from "../../../middleware/requireHuman";
import { sendError } from "../../../lib/utils/errors";

const router = Router();
const dropService = new Drop();

// Every promoter route is human-only.
router.use(requireHuman);

// POST /api/promoter/drop: creates the MPT issuance on the ledger.
router.post("/drop", validate(CreateDropDto), async (req: Request, res: Response) => {
  try {
    const drop = await dropService.createDrop(req.body as CreateDropDto);
    res.status(201).json({ success: true, data: drop });
  } catch (error) {
    sendError(res, error, "Failed to create drop");
  }
});

router.post("/drop/open", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: dropService.openDrop() });
  } catch (error) {
    sendError(res, error, "Failed to open drop");
  }
});

router.post("/drop/close", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: dropService.closeDrop() });
  } catch (error) {
    sendError(res, error, "Failed to close drop");
  }
});

router.patch("/drop", validate(UpdateDropDto), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: dropService.updateDrop(req.body as UpdateDropDto) });
  } catch (error) {
    sendError(res, error, "Failed to update drop");
  }
});

router.get("/stats", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: dropService.getStats() });
  } catch (error) {
    sendError(res, error, "Failed to fetch stats");
  }
});

export default router;

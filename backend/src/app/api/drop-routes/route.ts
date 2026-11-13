import { Router, Request, Response } from "express";
import { Drop } from "../../../application-logic/drop-logic/Drop";
import { sendError } from "../../../lib/utils/errors";
import { eventIdFrom } from "../../../lib/utils/eventId";

const router = Router();
const dropService = new Drop();

// GET /api/drop
router.get("/", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: dropService.getDrop(eventIdFrom(req)) });
  } catch (error) {
    sendError(res, error, "Failed to fetch drop");
  }
});

export default router;

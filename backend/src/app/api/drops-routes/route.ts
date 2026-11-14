import { Router, Request, Response } from "express";
import { Drop } from "../../../application-logic/drop-logic/Drop";
import { Resale } from "../../../application-logic/resale-logic/Resale";
import { sendError } from "../../../lib/utils/errors";

// Public: browse events and their open resale listings.
const router = Router();
const dropService = new Drop();
const resaleService = new Resale();

router.get("/", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: dropService.list() });
  } catch (error) {
    sendError(res, error, "Failed to load events");
  }
});

router.get("/:eventId", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: dropService.getDrop(req.params.eventId as string) });
  } catch (error) {
    sendError(res, error, "Failed to load event");
  }
});

router.get("/:eventId/listings", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: resaleService.listListings(req.params.eventId as string) });
  } catch (error) {
    sendError(res, error, "Failed to load resale listings");
  }
});

export default router;

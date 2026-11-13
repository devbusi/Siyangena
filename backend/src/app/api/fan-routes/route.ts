import { Router, Request, Response } from "express";
import { Fans } from "../../../application-logic/fan-logic/Fans";
import { Mandates } from "../../../application-logic/mandate-logic/Mandates";
import { PutMandateDto } from "../../../dto/fan.dto";
import { validate } from "../../../middleware/validate";
import { requireHuman } from "../../../middleware/requireHuman";
import { sendError } from "../../../lib/utils/errors";

const router = Router();
const fanService = new Fans();
const mandateService = new Mandates();

// GET /api/fans: the demo cast
router.get("/", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: fanService.listFans() });
  } catch (error) {
    sendError(res, error, "Failed to fetch fans");
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: fanService.getFan(req.params.id as string) });
  } catch (error) {
    sendError(res, error, "Failed to fetch fan");
  }
});

// POST /api/fans/:id/verify: Credential, accept, opt-in, promoter authorisation.
// Human-only: the promoter decides who is a verified fan.
router.post("/:id/verify", requireHuman, async (req: Request, res: Response) => {
  try {
    const fan = await fanService.verifyFan(req.params.id as string);
    res.json({ success: true, data: fan });
  } catch (error) {
    sendError(res, error, "Failed to verify fan");
  }
});

router.get("/:id/wallet", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await fanService.getWallet(req.params.id as string) });
  } catch (error) {
    sendError(res, error, "Failed to fetch wallet");
  }
});

router.get("/:id/tickets", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await fanService.getTickets(req.params.id as string) });
  } catch (error) {
    sendError(res, error, "Failed to fetch tickets");
  }
});

// ---- Mandate: human writes, agent reads ----

router.get("/:id/mandate", async (req: Request, res: Response) => {
  try {
    fanService.getContext(req.params.id as string);
    res.json({ success: true, data: mandateService.getMandate(req.params.id as string) });
  } catch (error) {
    sendError(res, error, "Failed to fetch mandate");
  }
});

router.put("/:id/mandate", requireHuman, validate(PutMandateDto), async (req: Request, res: Response) => {
  try {
    fanService.getContext(req.params.id as string);
    const mandate = mandateService.putMandate(req.params.id as string, req.body as PutMandateDto);
    res.json({ success: true, data: mandate });
  } catch (error) {
    sendError(res, error, "Failed to save mandate");
  }
});

router.delete("/:id/mandate", requireHuman, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: mandateService.cancelMandate(req.params.id as string) });
  } catch (error) {
    sendError(res, error, "Failed to cancel mandate");
  }
});

export default router;

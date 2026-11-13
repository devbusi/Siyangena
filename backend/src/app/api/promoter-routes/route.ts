import { Router, Request, Response } from "express";
import { Drop } from "../../../application-logic/drop-logic/Drop";
import { accounts } from "../../../application-logic/account-logic/Accounts";
import { CreateDropDto, UpdateDropDto } from "../../../dto/drop.dto";
import { validate } from "../../../middleware/validate";
import { requireRole } from "../../../middleware/auth";
import { ApiError, sendError } from "../../../lib/utils/errors";
import { supabaseConfigured } from "../../../lib/supabase";

const router = Router();
const dropService = new Drop();

// Every promoter route needs a promoter (or admin) account. Creating and opening sales
// also need an approved application.
router.use(requireRole("promoter"));

type Who = { id: string; name: string; isAdmin: boolean };
function who(req: Request): Who {
  const a = req.actor;
  if (a?.kind === "user") return { id: a.id, name: a.name, isAdmin: a.role === "admin" };
  return { id: "admin-key", name: "Siyangena", isAdmin: true };
}

// Changing an event (opening or closing sales, its rules) is for the promoter who owns it.
// Admins can see every event, but they can't run someone else's. Only the scripts' admin key can.
function assertCanManage(eventId: string, w: Who) {
  return dropService.assertOwner(eventId, { id: w.id, isAdmin: w.id === "admin-key" });
}

async function assertApproved(w: Who) {
  if (w.isAdmin || !supabaseConfigured()) return { displayName: w.name };
  return accounts.assertApprovedPromoter(w.id);
}

// ---- Multi-event routes (the app) ----

router.get("/events", async (req: Request, res: Response) => {
  try {
    const w = who(req);
    res.json({ success: true, data: dropService.list(w.isAdmin ? undefined : { promoterId: w.id }) });
  } catch (error) {
    sendError(res, error, "Failed to load your events");
  }
});

router.post("/events", validate(CreateDropDto), async (req: Request, res: Response) => {
  try {
    const w = who(req);
    if (w.isAdmin && w.id !== "admin-key") throw new ApiError(403, "UNAUTHORIZED", "Admins review events, they don't create them. Use a promoter account.");
    const application = await assertApproved(w);
    const promoter = w.isAdmin && w.id === "admin-key" ? undefined : { id: w.id, name: application.displayName || w.name };
    const drop = await dropService.createDrop(req.body as CreateDropDto, promoter);
    res.status(201).json({ success: true, data: drop });
  } catch (error) {
    sendError(res, error, "Failed to create event");
  }
});

router.post("/events/:eventId/open", async (req: Request, res: Response) => {
  try {
    const w = who(req);
    await assertApproved(w);
    assertCanManage(req.params.eventId as string, w);
    res.json({ success: true, data: dropService.openDrop(req.params.eventId as string) });
  } catch (error) {
    sendError(res, error, "Failed to open sales");
  }
});

router.post("/events/:eventId/close", async (req: Request, res: Response) => {
  try {
    assertCanManage(req.params.eventId as string, who(req));
    res.json({ success: true, data: dropService.closeDrop(req.params.eventId as string) });
  } catch (error) {
    sendError(res, error, "Failed to close sales");
  }
});

router.patch("/events/:eventId", validate(UpdateDropDto), async (req: Request, res: Response) => {
  try {
    assertCanManage(req.params.eventId as string, who(req));
    res.json({ success: true, data: dropService.updateDrop(req.body as UpdateDropDto, req.params.eventId as string) });
  } catch (error) {
    sendError(res, error, "Failed to update event");
  }
});

router.get("/events/:eventId/stats", async (req: Request, res: Response) => {
  try {
    dropService.assertOwner(req.params.eventId as string, who(req));
    res.json({ success: true, data: dropService.getStats(req.params.eventId as string) });
  } catch (error) {
    sendError(res, error, "Failed to fetch stats");
  }
});

// ---- Single-event routes (setup and demo scripts, admin key) ----

router.post("/drop", validate(CreateDropDto), async (req: Request, res: Response) => {
  try {
    const w = who(req);
    await assertApproved(w);
    const promoter = w.id === "admin-key" ? undefined : { id: w.id, name: w.name };
    const drop = await dropService.createDrop(req.body as CreateDropDto, promoter);
    res.status(201).json({ success: true, data: drop });
  } catch (error) {
    sendError(res, error, "Failed to create drop");
  }
});

// Legacy single-event routes: only the scripts' admin key.
function scriptsOnly(req: Request) {
  if (who(req).id !== "admin-key" && supabaseConfigured()) {
    throw new ApiError(403, "UNAUTHORIZED", "Use your event's own page to change it");
  }
}

router.post("/drop/open", async (req: Request, res: Response) => {
  try {
    scriptsOnly(req);
    res.json({ success: true, data: dropService.openDrop(typeof req.query.eventId === "string" ? req.query.eventId : undefined) });
  } catch (error) {
    sendError(res, error, "Failed to open drop");
  }
});

router.post("/drop/close", async (req: Request, res: Response) => {
  try {
    scriptsOnly(req);
    res.json({ success: true, data: dropService.closeDrop(typeof req.query.eventId === "string" ? req.query.eventId : undefined) });
  } catch (error) {
    sendError(res, error, "Failed to close drop");
  }
});

router.patch("/drop", validate(UpdateDropDto), async (req: Request, res: Response) => {
  try {
    scriptsOnly(req);
    res.json({ success: true, data: dropService.updateDrop(req.body as UpdateDropDto, typeof req.query.eventId === "string" ? req.query.eventId : undefined) });
  } catch (error) {
    sendError(res, error, "Failed to update drop");
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: dropService.getStats(typeof req.query.eventId === "string" ? req.query.eventId : undefined) });
  } catch (error) {
    sendError(res, error, "Failed to fetch stats");
  }
});

export default router;

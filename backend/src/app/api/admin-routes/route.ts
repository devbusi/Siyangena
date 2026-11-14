import { Router, Request, Response } from "express";
import type { ApplicationStatus } from "@drop/shared";
import { accounts } from "../../../application-logic/account-logic/Accounts";
import { ChangeReviewDto, ReviewDto, RoleDto } from "../../../dto/account.dto";
import { validate } from "../../../middleware/validate";
import { forgetUser, requireRole } from "../../../middleware/auth";
import { ApiError, sendError } from "../../../lib/utils/errors";
import { Payouts } from "../../../application-logic/payout-logic/Payouts";
import { Drop } from "../../../application-logic/drop-logic/Drop";

const drops = new Drop();

const payouts = new Payouts();

// Siyangena admins: review promoter applications and manage roles.
const router = Router();
router.use(requireRole("admin"));

const actorId = (req: Request) => (req.actor?.kind === "user" ? req.actor.id : "admin-key");

router.get("/applications", async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? (req.query.status as ApplicationStatus) : undefined;
    res.json({ success: true, data: await accounts.listApplications(status) });
  } catch (error) {
    sendError(res, error, "Failed to load applications");
  }
});

router.post("/applications/:userId/review", validate(ReviewDto), async (req: Request, res: Response) => {
  try {
    const { decision, note } = req.body as ReviewDto;
    const result = await accounts.reviewApplication(actorId(req), req.params.userId as string, decision, note);
    forgetUser(req.params.userId as string);
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error, "Failed to review application");
  }
});

router.get("/users", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await accounts.listUsers() });
  } catch (error) {
    sendError(res, error, "Failed to load users");
  }
});

router.post("/users/:userId/role", validate(RoleDto), async (req: Request, res: Response) => {
  try {
    await accounts.setRole(req.params.userId as string, req.body.role);
    forgetUser(req.params.userId as string);
    res.json({ success: true, data: { userId: req.params.userId, role: req.body.role } });
  } catch (error) {
    sendError(res, error, "Failed to change role");
  }
});

router.get("/events/review", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: drops.inReview() });
  } catch (error) {
    sendError(res, error, "Failed to load events to review");
  }
});

router.post("/events/:eventId/review", async (req: Request, res: Response) => {
  try {
    const decision = req.body?.decision === "approved" ? "approved" : req.body?.decision === "needs_more" ? "needs_more" : null;
    if (!decision) throw new ApiError(400, "VALIDATION_ERROR", "Approve it or ask for changes");
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) : undefined;
    if (decision === "needs_more" && !note) throw new ApiError(400, "VALIDATION_ERROR", "Say what needs to change");
    res.json({ success: true, data: drops.reviewEvent(req.params.eventId as string, decision, note) });
  } catch (error) {
    sendError(res, error, "Failed to review the event");
  }
});

router.get("/change-requests", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await accounts.listChangeRequests() });
  } catch (error) {
    sendError(res, error, "Failed to load change requests");
  }
});

router.post("/change-requests/:userId/review", validate(ChangeReviewDto), async (req: Request, res: Response) => {
  try {
    const { decision, note } = req.body as { decision: "approved" | "rejected"; note?: string };
    res.json({ success: true, data: await accounts.reviewChangeRequest(req.params.userId as string, decision, note) });
  } catch (error) {
    sendError(res, error, "Failed to review the change");
  }
});

router.get("/revenue", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: payouts.revenue() });
  } catch (error) {
    sendError(res, error, "Failed to load revenue");
  }
});

router.get("/payouts", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: payouts.all() });
  } catch (error) {
    sendError(res, error, "Failed to load payouts");
  }
});

router.post("/payouts/:payoutId/paid", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await payouts.markPaid(req.params.payoutId as string) });
  } catch (error) {
    sendError(res, error, "Failed to mark the payout paid");
  }
});

export default router;

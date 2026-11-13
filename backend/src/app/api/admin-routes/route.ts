import { Router, Request, Response } from "express";
import type { ApplicationStatus } from "@drop/shared";
import { accounts } from "../../../application-logic/account-logic/Accounts";
import { ReviewDto, RoleDto } from "../../../dto/account.dto";
import { validate } from "../../../middleware/validate";
import { forgetUser, requireRole } from "../../../middleware/auth";
import { sendError } from "../../../lib/utils/errors";
import { Payouts } from "../../../application-logic/payout-logic/Payouts";

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

router.get("/payouts", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: payouts.all() });
  } catch (error) {
    sendError(res, error, "Failed to load payouts");
  }
});

router.post("/payouts/:payoutId/paid", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: payouts.markPaid(req.params.payoutId as string) });
  } catch (error) {
    sendError(res, error, "Failed to mark the payout paid");
  }
});

export default router;

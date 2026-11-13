import { Router, Request, Response } from "express";
import { accounts } from "../../../application-logic/account-logic/Accounts";
import { Fans } from "../../../application-logic/fan-logic/Fans";
import { Mandates } from "../../../application-logic/mandate-logic/Mandates";
import { Sales } from "../../../application-logic/sale-logic/Sales";
import { Resale } from "../../../application-logic/resale-logic/Resale";
import { AgentRuns } from "../../../application-logic/agent-run-logic/AgentRuns";
import { Drop } from "../../../application-logic/drop-logic/Drop";
import { ApplicationDto, BuyDto, MeAgentDto, ResellDto, TopUpDto } from "../../../dto/account.dto";
import { PutMandateDto } from "../../../dto/fan.dto";
import { validate } from "../../../middleware/validate";
import { requireUser } from "../../../middleware/auth";
import { sendError } from "../../../lib/utils/errors";
import { zarToSettle } from "../../../lib/utils/money";
import { supabaseConfigured } from "../../../lib/supabase";

// Everything a signed-in person does for themselves.
const router = Router();
const fanService = new Fans();
const mandateService = new Mandates();
const saleService = new Sales();
const resaleService = new Resale();
const agentRuns = new AgentRuns();
const dropService = new Drop();

router.use((req, res, next) => {
  if (!supabaseConfigured()) {
    return res.status(503).json({ success: false, code: "INTERNAL_ERROR", message: "Accounts are off: Supabase is not configured on the server" });
  }
  next();
});
router.use(requireUser);

const me = (req: Request) => (req.actor as { id: string; email: string; name: string; role: string });

router.get("/", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await accounts.me(me(req).id) });
  } catch (error) {
    sendError(res, error, "Failed to load your account");
  }
});

// Creates the profile (if the sign-up trigger did not) and the ticket wallet. Takes a few seconds the first time.
router.post("/setup", async (req: Request, res: Response) => {
  try {
    const a = me(req);
    await accounts.ensureProfile({ id: a.id, email: a.email, fullName: a.name });
    await accounts.ensureWallet(a.id);
    res.json({ success: true, data: await accounts.me(a.id) });
  } catch (error) {
    sendError(res, error, "Failed to set up your account");
  }
});

// ID and selfie check (simulated for the hackathon), then the verified-fan credential.
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const a = me(req);
    await accounts.ensureWallet(a.id);
    await fanService.verifyFan(a.id);
    res.json({ success: true, data: await accounts.me(a.id) });
  } catch (error) {
    sendError(res, error, "Failed to verify you");
  }
});

router.get("/wallet", async (req: Request, res: Response) => {
  try {
    const eventId = typeof req.query.eventId === "string" ? req.query.eventId : undefined;
    res.json({ success: true, data: await fanService.getWallet(me(req).id, eventId) });
  } catch (error) {
    sendError(res, error, "Failed to load your wallet");
  }
});

// Test money on Testnet, from the demo bank wallet.
router.post("/topup", validate(TopUpDto), async (req: Request, res: Response) => {
  try {
    const result = await accounts.topUp(me(req).id, zarToSettle(req.body.amountZar));
    fanService.addHistory(me(req).id, { kind: "refund", description: `Topped up R${req.body.amountZar} (test money)`, tickets: 0, txHash: result.hash });
    res.json({ success: true, data: await fanService.getWallet(me(req).id) });
  } catch (error) {
    sendError(res, error, "Failed to top up");
  }
});

router.get("/tickets", async (req: Request, res: Response) => {
  try {
    const eventId = typeof req.query.eventId === "string" ? req.query.eventId : undefined;
    res.json({ success: true, data: await fanService.getTickets(me(req).id, eventId) });
  } catch (error) {
    sendError(res, error, "Failed to load your tickets");
  }
});

router.post("/promoter-application", validate(ApplicationDto), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await accounts.submitApplication(me(req).id, req.body as ApplicationDto) });
  } catch (error) {
    sendError(res, error, "Failed to send your application");
  }
});

// Every agent this person has set up, across events, newest event first.
router.get("/agents", async (req: Request, res: Response) => {
  try {
    const id = me(req).id;
    const list = mandateService
      .listForFan(id)
      .filter((m) => m.status !== "cancelled")
      .map((mandate) => {
        try {
          const d = dropService.getRecord(mandate.eventId);
          return {
            eventId: d.id,
            eventName: d.name,
            venue: d.venue,
            startsAt: d.startsAt,
            eventState: d.state,
            mandate,
            running: agentRuns.isRunning(id, d.id),
          };
        } catch {
          return null; // the event was removed
        }
      })
      .filter((a) => a !== null)
      .sort((a, b) => String(b!.startsAt).localeCompare(String(a!.startsAt)));
    res.json({ success: true, data: list });
  } catch (error) {
    sendError(res, error, "Failed to load your agents");
  }
});

// ---- Per event ----

router.get("/events/:eventId/mandate", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: mandateService.findMandate(me(req).id, req.params.eventId as string) });
  } catch (error) {
    sendError(res, error, "Failed to load your agent limits");
  }
});

router.put("/events/:eventId/mandate", validate(PutMandateDto), async (req: Request, res: Response) => {
  try {
    dropService.getRecord(req.params.eventId as string);
    res.json({ success: true, data: mandateService.putMandate(me(req).id, req.body as PutMandateDto, req.params.eventId as string) });
  } catch (error) {
    sendError(res, error, "Failed to save your agent limits");
  }
});

// Buy tickets now, no agent. Tickets arrive a few seconds later (watch the live feed).
router.post("/events/:eventId/buy", validate(BuyDto), async (req: Request, res: Response) => {
  try {
    const result = await saleService.buyNow(me(req).id, req.body.quantity, req.params.eventId as string);
    res.status(202).json({ success: true, data: result });
  } catch (error) {
    sendError(res, error, "Failed to buy tickets");
  }
});

router.get("/purchases/:requestId", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: saleService.intentStatus(req.params.requestId as string) });
  } catch (error) {
    sendError(res, error, "Failed to check your purchase");
  }
});

// Add an agent for this event: it buys, finds a resale ticket, or sells, within your limits.
router.post("/events/:eventId/agent", validate(MeAgentDto), async (req: Request, res: Response) => {
  try {
    const { goal, priceZar } = req.body;
    res.status(202).json({ success: true, data: agentRuns.start(me(req).id, goal, priceZar, req.params.eventId as string) });
  } catch (error) {
    sendError(res, error, "Failed to start your agent");
  }
});

// Can't go: list a ticket. The server signs the swap for you when a verified fan buys it.
router.post("/events/:eventId/resell", validate(ResellDto), async (req: Request, res: Response) => {
  try {
    res.status(201).json({ success: true, data: await resaleService.createListing(me(req).id, req.body.priceZar, req.params.eventId as string) });
  } catch (error) {
    sendError(res, error, "Failed to list your ticket");
  }
});

router.post("/listings/:listingId/buy", async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await resaleService.buyListing(req.params.listingId as string, me(req).id) });
  } catch (error) {
    sendError(res, error, "Failed to buy this ticket");
  }
});

export default router;

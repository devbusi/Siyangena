import { Router, Request, Response } from "express";
import dropRoutes from "../drop-routes/route";
import promoterRoutes from "../promoter-routes/route";
import fanRoutes from "../fan-routes/route";
import saleRoutes from "../sale-routes/route";
import resaleRoutes from "../resale-routes/route";
import agentLogRoutes from "../agent-log-routes/route";
import eventRoutes from "../event-routes/route";
import agentRoutes from "../agent-routes/route";
import { xrplService } from "../../../xrpl/xrpl.service";

const router = Router();

router.use("/drop", dropRoutes);
router.use("/promoter", promoterRoutes);
router.use("/fans", fanRoutes);
router.use("/sales", saleRoutes);
router.use("/resale", resaleRoutes);
router.use("/agent-log", agentLogRoutes);
router.use("/events", eventRoutes);
router.use("/agents", agentRoutes);

// GET /api/status: XRPL connection health
router.get("/status", async (_req: Request, res: Response) => {
  const status = await xrplService.verifyConnection();
  res.json({ success: true, data: status });
});

export default router;

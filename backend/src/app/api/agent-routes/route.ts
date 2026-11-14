import { Router, Request, Response } from "express";
import { AgentRuns } from "../../../application-logic/agent-run-logic/AgentRuns";
import { AgentRunDto } from "../../../dto/agent-run.dto";
import { requireHumanFor } from "../../../middleware/auth";
import { eventIdFrom } from "../../../lib/utils/eventId";
import { validate } from "../../../middleware/validate";
import { sendError } from "../../../lib/utils/errors";

const router = Router();
const runs = new AgentRuns();

// POST /api/agents/:fanId/run: the fan arms their agent from the app.
// Human-only: an agent can't start (or restart) itself.
router.post("/:fanId/run", requireHumanFor("param", "fanId"), validate(AgentRunDto), async (req: Request, res: Response) => {
  try {
    const { goal, priceZar } = req.body as AgentRunDto;
    res.status(202).json({ success: true, data: runs.start(req.params.fanId as string, goal, priceZar, eventIdFrom(req)) });
  } catch (error) {
    sendError(res, error, "Failed to start agent");
  }
});

router.get("/:fanId", async (req: Request, res: Response) => {
  res.json({ success: true, data: { fanId: req.params.fanId, running: runs.isRunning(req.params.fanId as string) } });
});

export default router;

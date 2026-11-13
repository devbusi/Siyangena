import { Router, Request, Response } from "express";
import { AgentLog } from "../../../application-logic/agent-log-logic/AgentLog";
import { AgentLogDto } from "../../../dto/agent-log.dto";
import { validate } from "../../../middleware/validate";
import { sendError } from "../../../lib/utils/errors";

const router = Router();
const agentLogService = new AgentLog();

router.post("/", validate(AgentLogDto), async (req: Request, res: Response) => {
  try {
    const entry = agentLogService.addEntry(req.body as AgentLogDto);
    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    sendError(res, error, "Failed to write agent log");
  }
});

// GET /api/agent-log?fanId=thandi
router.get("/", async (req: Request, res: Response) => {
  try {
    const fanId = typeof req.query.fanId === "string" ? req.query.fanId : undefined;
    res.json({ success: true, data: agentLogService.listEntries(fanId) });
  } catch (error) {
    sendError(res, error, "Failed to fetch agent log");
  }
});

export default router;

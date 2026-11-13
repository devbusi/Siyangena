import { Router, Request, Response } from "express";
import { Events } from "../../../application-logic/event-logic/Events";

const router = Router();
const eventService = new Events();

// GET /api/events: Server-Sent Events. Replays the last 50 events, then streams live.
router.get("/", (req: Request, res: Response) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  for (const event of eventService.recent(50)) send(event);

  const unsubscribe = eventService.subscribe(send);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

export default router;

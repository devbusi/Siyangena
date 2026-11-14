import type { Request } from "express";

// Which event a request is about: the URL, the body, the query or the X-Event-Id header
// (agents send the header). Undefined means "the featured event", as before.
export function eventIdFrom(req: Request): string | undefined {
  const fromParams = (req.params as any)?.eventId;
  const fromBody = req.body?.eventId;
  const fromQuery = typeof req.query?.eventId === "string" ? req.query.eventId : undefined;
  const fromHeader = req.header("x-event-id");
  const id = fromParams || fromBody || fromQuery || fromHeader;
  return typeof id === "string" && id ? id : undefined;
}

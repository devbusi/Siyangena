import { Request, Response, NextFunction } from "express";

let warned = false;

// Guards human-only routes (promoter controls, mandate writes). The web app sends
// "Authorization: Bearer <HUMAN_API_KEY>"; agent processes are never given the key,
// so an agent can read its mandate but can never change it.
// If HUMAN_API_KEY is empty (local dev) the check is skipped.
export function requireHuman(req: Request, res: Response, next: NextFunction) {
  const key = process.env.HUMAN_API_KEY;
  if (!key) {
    if (!warned) {
      console.warn("HUMAN_API_KEY not set: human-only routes are open (dev mode)");
      warned = true;
    }
    return next();
  }

  const header = req.headers["authorization"];
  const token = header && header.split(" ")[1];
  if (token !== key) {
    return res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "This route is for humans only (missing or wrong HUMAN_API_KEY)",
    });
  }
  next();
}

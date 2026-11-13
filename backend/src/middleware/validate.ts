import { Request, Response, NextFunction } from "express";
import { z } from "zod";

// Validates req.body against a request DTO. On success req.body is replaced with
// the parsed value (trimmed, coerced, unknown keys stripped); on failure the
// handler never runs and the client gets a 400 listing each invalid field.
export function validate(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    req.body = result.data;
    next();
  };
}

import type { Response } from "express";
import type { ApiFailure, ErrorCode } from "@drop/shared";

// Thrown by the logic layer; routes turn it into { success: false, code, message }.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const forbidden = (code: ErrorCode, message: string) => new ApiError(403, code, message);
export const conflict = (code: ErrorCode, message: string) => new ApiError(409, code, message);
export const notFound = (message: string) => new ApiError(404, "NOT_FOUND", message);
export const badRequest = (code: ErrorCode, message: string) => new ApiError(400, code, message);

// Same shape as CropMarket's route catch blocks, plus a machine-readable code.
export function sendError(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError) {
    const body: ApiFailure = { success: false, code: error.code, message: error.message };
    return res.status(error.status).json(body);
  }
  console.error(`${fallbackMessage}:`, error);
  const body: ApiFailure = {
    success: false,
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? `${fallbackMessage}: ${error.message}` : fallbackMessage,
  };
  return res.status(500).json(body);
}

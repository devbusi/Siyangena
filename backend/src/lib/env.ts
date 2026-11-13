import path from "path";
import dotenv from "dotenv";

// Load the repo-root .env before anything reads process.env
// (shared/config.ts reads it at import time). Import this module first.
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });
dotenv.config({ quiet: true });

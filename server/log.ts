// Shared logging utility
// Separate file to avoid circular dependencies with index.ts

import { log as structuredLog } from "./logger";

export function log(message: string, source = "server") {
  structuredLog(message, source);
}

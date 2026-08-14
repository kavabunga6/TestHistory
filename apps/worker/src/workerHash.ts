import { createHash } from "node:crypto";

export function hashIdempotencyParts(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 24);
}

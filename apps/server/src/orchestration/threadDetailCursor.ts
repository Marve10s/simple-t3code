import type { ThreadId } from "@t3tools/contracts";

export interface ThreadDetailPageCursor {
  readonly threadId: ThreadId;
  readonly beforeAnchorAt: string;
  readonly beforeTurnId: string;
}

export function encodeThreadDetailPageCursor(cursor: ThreadDetailPageCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.threadId, a: cursor.beforeAnchorAt, i: cursor.beforeTurnId }),
  ).toString("base64url");
}

export function decodeThreadDetailPageCursor(encoded: string): ThreadDetailPageCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.t !== "string" || record.t.length === 0) {
    return null;
  }
  if (typeof record.a !== "string") {
    return null;
  }
  if (typeof record.i !== "string") {
    return null;
  }
  return { threadId: record.t as ThreadId, beforeAnchorAt: record.a, beforeTurnId: record.i };
}

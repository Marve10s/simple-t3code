import * as Schema from "effect/Schema";

const TAB_ID_PREFIX = "tab_";
let nextPreviewTabSequence = 0;

export function newPreviewTabId(): string {
  nextPreviewTabSequence += 1;
  return `${TAB_ID_PREFIX}${nextPreviewTabSequence.toString(36)}`;
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export const LSOF_LOCAL_HOST_TOKENS: ReadonlySet<string> = new Set([
  ...LOOPBACK_HOSTS,
  "*",
  "[::]",
  "[::1]",
]);

const LOOPBACK_PREFIX_PATTERN = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::|\/|$)/i;

export function isLoopbackHost(host: string): boolean {
  if (LOOPBACK_HOSTS.has(host)) return true;
  if (host === "[::1]") return true;
  return false;
}

export class PreviewUrlNormalizationError extends Schema.TaggedError<PreviewUrlNormalizationError>()(
  "PreviewUrlNormalizationError",
  {
    inputLength: Schema.Number,
    reason: Schema.Literals(["empty", "parse", "unsupported-protocol"]),
    protocol: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    const protocol = this.protocol === undefined ? "" : `: ${this.protocol}`;
    return `Invalid preview URL (${this.reason}${protocol}; input length ${this.inputLength}).`;
  }
}

export const isPreviewUrlNormalizationError = Schema.is(PreviewUrlNormalizationError);

function previewUrlProtocol(rawUrl: string): string | undefined {
  return /^([A-Za-z][A-Za-z\d+.-]*):/.exec(rawUrl)?.[1]?.toLowerCase().concat(":");
}

export function normalizePreviewUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    throw new PreviewUrlNormalizationError({ inputLength: rawUrl.length, reason: "empty" });
  }
  const useHttp = LOOPBACK_PREFIX_PATTERN.test(trimmed);
  const candidate = trimmed.includes("://")
    ? trimmed
    : `${useHttp ? "http" : "https"}://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch (cause) {
    throw new PreviewUrlNormalizationError({
      inputLength: rawUrl.length,
      reason: "parse",
      protocol: previewUrlProtocol(candidate),
      cause,
    });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PreviewUrlNormalizationError({
      inputLength: rawUrl.length,
      reason: "unsupported-protocol",
      protocol: parsed.protocol,
    });
  }
  return parsed.href;
}

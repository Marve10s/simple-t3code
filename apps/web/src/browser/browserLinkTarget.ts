import type { BrowserLinkTarget } from "@t3tools/contracts";

import { ensureClientSettingsHydrated, getClientSettings } from "~/hooks/useSettings";
import { isPreviewSupportedInRuntime } from "~/previewStateStore";

export interface ResolveLinkTargetInput {
  readonly url: string;
  readonly event: { readonly metaKey: boolean; readonly ctrlKey: boolean };
  readonly preference: BrowserLinkTarget;
  readonly canOpenInApp: boolean;
}

export function resolveLinkTarget(input: ResolveLinkTargetInput): BrowserLinkTarget {
  if (input.event.metaKey || input.event.ctrlKey) return "system";
  if (input.preference !== "app") return "system";
  if (!input.canOpenInApp) return "system";
  if (!isWebUrl(input.url)) return "system";
  return "app";
}

export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export async function resolveBrowserLinkTargetPreference(): Promise<BrowserLinkTarget> {
  await ensureClientSettingsHydrated();
  return getClientSettings().browserLinkTarget;
}

export function canOpenLinksInApp(hasThread: boolean): boolean {
  return hasThread && isPreviewSupportedInRuntime();
}

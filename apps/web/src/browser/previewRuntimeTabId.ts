import type { ScopedThreadRef } from "@t3tools/contracts";

export function previewRuntimeTabId(
  threadRef: ScopedThreadRef,
  serverEpoch: string | null,
  tabId: string,
): string {
  return JSON.stringify([threadRef.environmentId, threadRef.threadId, serverEpoch, tabId]);
}

export function isCurrentPreviewRuntimeTab(
  threadRef: ScopedThreadRef,
  serverEpoch: string | null,
  tabId: string,
  runtimeTabId: string,
): boolean {
  return previewRuntimeTabId(threadRef, serverEpoch, tabId) === runtimeTabId;
}

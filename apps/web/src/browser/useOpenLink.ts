import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useCallback } from "react";

import { recordVisitForThread } from "~/browserHistoryStore";
import { readLocalApi } from "~/localApi";
import { previewEnvironment } from "~/state/preview";
import { useAtomCommand } from "~/state/use-atom-command";

import {
  canOpenLinksInApp,
  resolveBrowserLinkTargetPreference,
  resolveLinkTarget,
} from "./browserLinkTarget";
import { BrowserSettingsReadError, openUrlInPreview } from "./openFileInPreview";

const NO_MODIFIER = { metaKey: false, ctrlKey: false } as const;

export function useOpenLink(threadRef: ScopedThreadRef | null | undefined): (
  url: string,
  options?: {
    readonly event?: { readonly metaKey: boolean; readonly ctrlKey: boolean };
    readonly threadRef?: ScopedThreadRef | undefined;
  },
) => Promise<void> {
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  return useCallback(
    async (url, options = {}) => {
      const targetThreadRef = options.threadRef ?? threadRef;
      const target = resolveLinkTarget({
        url,
        event: options.event ?? NO_MODIFIER,
        preference: await resolveBrowserLinkTargetPreference(),
        canOpenInApp: canOpenLinksInApp(Boolean(targetThreadRef)),
      });
      if (target === "app" && targetThreadRef) {
        const result = await openUrlInPreview({ threadRef: targetThreadRef, url, openPreview });
        if (isAtomCommandInterrupted(result)) return;
        if (result._tag === "Success") {
          recordVisitForThread(targetThreadRef, url);
          return;
        }
        const failure = squashAtomCommandFailure(result);
        if (failure instanceof BrowserSettingsReadError) throw failure;
        console.error(result.cause);
      }
      const api = readLocalApi();
      if (!api) throw new Error("Link opening is unavailable.");
      await api.shell.openExternal(url);
    },
    [openPreview, threadRef],
  );
}

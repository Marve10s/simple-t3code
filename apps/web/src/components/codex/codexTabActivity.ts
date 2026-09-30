import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { TerminalSummary } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import { useComposerDraftStore } from "../../composerDraftStore";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { readThreadShell, useThreadShell } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { terminalEnvironment } from "../../state/terminal";
import type { CodexTab } from "./codexTabs";

export function codexTabThreadRef(tab: CodexTab) {
  const environmentId =
    tab.environmentId ??
    (tab.kind === "draft"
      ? useComposerDraftStore.getState().getDraftSession(tab.draftId)?.environmentId
      : undefined);
  return environmentId ? scopeThreadRef(environmentId, tab.threadId) : null;
}

function tabCloseWarning(
  thread: EnvironmentThreadShell | null,
  terminals: ReadonlyArray<TerminalSummary> | null,
  threadId: string,
) {
  const ongoing =
    thread?.session?.status === "starting" ||
    thread?.session?.status === "running" ||
    thread?.hasPendingApprovals ||
    thread?.hasPendingUserInput ||
    thread?.backgroundLiveness != null;
  const running = terminals?.filter(
    (terminal) => terminal.threadId === threadId && terminal.hasRunningSubprocess,
  );
  if (ongoing && running?.length) {
    return "This thread is still working and has running commands or servers. Closing stops the thread and its terminals.";
  }
  if (ongoing) return "This thread is still ongoing. Closing stops it and its terminals.";
  if (running?.length) {
    return "This thread has running commands or servers. Closing stops its terminals.";
  }
  return terminals === null
    ? "Terminal activity is unavailable or still loading. Closing stops this thread and its terminals."
    : null;
}

export function readCodexTabActivity(tab: CodexTab) {
  const threadRef = codexTabThreadRef(tab);
  if (!threadRef) return { threadRef: null, thread: null, warning: null };
  const thread = readThreadShell(threadRef);
  const metadata = appAtomRegistry.get(
    terminalEnvironment.metadata({ environmentId: threadRef.environmentId, input: null }),
  );
  const terminals = Option.getOrNull(AsyncResult.value(metadata));
  return { threadRef, thread, warning: tabCloseWarning(thread, terminals, tab.threadId) };
}

export function useCodexTabCloseWarning(tab: CodexTab) {
  const threadRef = codexTabThreadRef(tab);
  const thread = useThreadShell(threadRef);
  const metadata = useEnvironmentQuery(
    threadRef
      ? terminalEnvironment.metadata({ environmentId: threadRef.environmentId, input: null })
      : null,
  );
  return threadRef ? tabCloseWarning(thread, metadata.data, tab.threadId) : null;
}

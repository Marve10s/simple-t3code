import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useRef, useState } from "react";

import { ensureLocalApi } from "../../localApi";
import { useThreadActions } from "../../hooks/useThreadActions";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { readEnvironmentSupportsSettlement, readThreadShell } from "../../state/entities";
import { terminalEnvironment } from "../../state/terminal";
import { environmentThreadShells, threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useTerminalUiStateStore } from "../../terminalUiStateStore";
import { toastManager } from "../ui/toast";
import { readCodexTabActivity } from "./codexTabActivity";
import { codexTabRenderKey, type CodexTab } from "./codexTabs";

function waitForStoppedThread(threadRef: ScopedThreadRef) {
  return new Promise<void>((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error("The thread has not stopped yet. Its tab was kept open. Please try again."));
    }, 30_000);
    const finish = () => {
      const thread = readThreadShell(threadRef);
      if (thread?.session && thread.session.status !== "stopped") return;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve();
    };
    unsubscribe = appAtomRegistry.subscribe(
      environmentThreadShells.threadShellAtom(threadRef),
      finish,
    );
    finish();
  });
}

export function useCodexTabClose() {
  const { settleThread } = useThreadActions();
  const stopSession = useAtomCommand(threadEnvironment.stopSession, { reportFailure: false });
  const closeTerminals = useAtomCommand(terminalEnvironment.close, { reportFailure: false });
  const pending = useRef(new Set<string>());
  const [closingKeys, setClosingKeys] = useState<ReadonlySet<string>>(new Set());

  const stopTab = async (tab: CodexTab, close: () => Promise<void>) => {
    const key = codexTabRenderKey(tab);
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setClosingKeys(new Set(pending.current));
    const settles = tab.kind === "thread" && readEnvironmentSupportsSettlement(tab.environmentId);
    try {
      const { warning } = readCodexTabActivity(tab);
      if (
        warning &&
        !(await ensureLocalApi().dialogs.confirm(
          `${warning}\n\nStop and ${settles ? "settle this chat" : "close this tab"}?`,
          {
            variant: "destructive",
          },
        ))
      )
        return;

      const { threadRef, thread } = readCodexTabActivity(tab);
      if (threadRef) {
        if (thread?.session && thread.session.status !== "stopped") {
          const result = await stopSession({
            environmentId: threadRef.environmentId,
            input: { threadId: threadRef.threadId },
          });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          await waitForStoppedThread(threadRef);
        }
        useTerminalUiStateStore.getState().setTerminalOpen(threadRef, false);
        const result = await closeTerminals({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId, deleteHistory: false },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        if (settles) {
          const settled = await settleThread(threadRef);
          if (settled._tag === "Failure") throw squashAtomCommandFailure(settled);
        }
      }
      await close();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: settles
          ? "Could not stop and settle this chat"
          : "Could not stop and close this tab",
        description:
          error instanceof Error ? error.message : "The tab was kept open. Please try again.",
      });
    } finally {
      pending.current.delete(key);
      setClosingKeys(new Set(pending.current));
    }
  };
  return { closingKeys, stopTab };
}

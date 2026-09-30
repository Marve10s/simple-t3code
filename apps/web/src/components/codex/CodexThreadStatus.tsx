import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";
import { useNavigate } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { useMemo } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { useThreadShells } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useUiStateStore } from "../../uiStateStore";
import { hasUnseenCompletion, resolveSidebarThreadStatus } from "../Sidebar.logic";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export type ThreadMarkTone =
  | "working"
  | "monitoring"
  | "approval"
  | "input"
  | "failed"
  | "woke"
  | "done";

const THREAD_MARK_LABELS: Record<ThreadMarkTone, string> = {
  working: "Working",
  monitoring: "Monitoring",
  approval: "Needs approval",
  input: "Needs input",
  failed: "Failed",
  woke: "Woke from snooze",
  done: "Finished",
};

function resolveThreadMarkTone(input: {
  thread: EnvironmentThreadShell;
  lastVisitedAt: string | undefined;
  wokeAt: string | null;
}): ThreadMarkTone | null {
  const status = resolveSidebarThreadStatus(input.thread);
  if (status !== "ready") return status;
  if (
    input.wokeAt !== null &&
    (input.lastVisitedAt === undefined || input.lastVisitedAt < input.wokeAt) &&
    input.thread.settledOverride !== "settled"
  ) {
    return "woke";
  }
  return hasUnseenCompletion({ ...input.thread, lastVisitedAt: input.lastVisitedAt })
    ? "done"
    : null;
}

export function useThreadMarkTones(): ReadonlyMap<string, ThreadMarkTone | null> {
  const threads = useThreadShells();
  const lastVisitedAtByThreadKey = useUiStateStore((store) => store.threadLastVisitedAtById);
  const nowMinute = useNowMinute();
  return useMemo(() => {
    void nowMinute;
    const now = new Date().toISOString();
    const tones = new Map<string, ThreadMarkTone | null>();
    for (const thread of threads) {
      const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      tones.set(
        threadKey,
        resolveThreadMarkTone({
          thread,
          lastVisitedAt: lastVisitedAtByThreadKey[threadKey],
          wokeAt: threadWokeAt(thread, { now }),
        }),
      );
    }
    return tones;
  }, [lastVisitedAtByThreadKey, nowMinute, threads]);
}

export function ThreadMark({ tone }: { tone: ThreadMarkTone | null }) {
  if (tone === null) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            data-codex-part="thread-mark"
            data-tone={tone}
            aria-label={THREAD_MARK_LABELS[tone]}
            className={tone === "working" ? "animate-status-pulse" : undefined}
          />
        }
      />
      <TooltipPopup side="right">{THREAD_MARK_LABELS[tone]}</TooltipPopup>
    </Tooltip>
  );
}

const ATTENTION_TONES: ReadonlySet<ThreadMarkTone | null> = new Set([
  "approval",
  "input",
  "failed",
  "woke",
]);

export function CodexNotificationsMenu() {
  const navigate = useNavigate();
  const threads = useThreadShells();
  const tones = useThreadMarkTones();
  const attentionThreads = useMemo(
    () =>
      threads.filter(
        (thread) =>
          thread.archivedAt === null &&
          ATTENTION_TONES.has(
            tones.get(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))) ?? null,
          ),
      ),
    [threads, tones],
  );

  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label="Notifications"
            data-codex-part="chrome-button"
            data-badge={attentionThreads.length > 0 ? "true" : undefined}
          />
        }
      >
        <BellIcon />
      </MenuTrigger>
      <MenuPopup align="start">
        {attentionThreads.length === 0 ? (
          <MenuItem disabled>No notifications</MenuItem>
        ) : (
          attentionThreads.map((thread) => {
            const threadRef = scopeThreadRef(thread.environmentId, thread.id);
            const threadKey = scopedThreadKey(threadRef);
            return (
              <MenuItem
                key={threadKey}
                onClick={() =>
                  void navigate({
                    to: "/$environmentId/$threadId",
                    params: buildThreadRouteParams(threadRef),
                  })
                }
              >
                <ThreadMark tone={tones.get(threadKey) ?? null} />
                <span className="max-w-64 truncate">{thread.title}</span>
              </MenuItem>
            );
          })
        )}
      </MenuPopup>
    </Menu>
  );
}

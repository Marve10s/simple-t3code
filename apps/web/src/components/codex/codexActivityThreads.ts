import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { useEffect, useMemo, useState } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { useServerConfigs, useThreadShells } from "../../state/entities";
import { sortPinnedThreadsForSidebar, sortThreadsForSidebar } from "../Sidebar.logic";

export function resolveCodexActivitySection(
  thread: EnvironmentThreadShell,
  options: { now: string; supportsSettlement: boolean; supportsSnooze: boolean },
) {
  if (options.supportsSnooze && effectiveSnoozed(thread, options)) return "snoozed";
  if (options.supportsSettlement && thread.settledOverride === "settled") return "settled";
  return thread.pinnedAt != null ? "pinned" : "active";
}

export function useCodexActivityThreads() {
  const threads = useThreadShells();
  const serverConfigs = useServerConfigs();
  useNowMinute();
  const [, bumpWakeTick] = useState(0);
  const now = new Date().toISOString();
  const nextWakeAt = threads.reduce((earliest, thread) => {
    if (
      thread.archivedAt !== null ||
      thread.snoozedUntil == null ||
      serverConfigs.get(thread.environmentId)?.environment.capabilities.threadSnooze !== true
    )
      return earliest;
    const wakeAt = Date.parse(thread.snoozedUntil);
    return wakeAt > Date.parse(now) ? Math.min(earliest, wakeAt) : earliest;
  }, Number.POSITIVE_INFINITY);
  useEffect(() => {
    if (!Number.isFinite(nextWakeAt)) return;
    const delay = Math.min(Math.max(0, nextWakeAt - Date.now()) + 50, 2_147_483_647);
    const timer = window.setTimeout(() => bumpWakeTick((tick) => tick + 1), delay);
    return () => window.clearTimeout(timer);
  }, [nextWakeAt]);
  return useMemo(() => {
    const pinned: EnvironmentThreadShell[] = [];
    const active: EnvironmentThreadShell[] = [];
    for (const thread of threads) {
      if (thread.archivedAt !== null) continue;
      const capabilities = serverConfigs.get(thread.environmentId)?.environment.capabilities;
      const section = resolveCodexActivitySection(thread, {
        now,
        supportsSettlement: capabilities?.threadSettlement === true,
        supportsSnooze: capabilities?.threadSnooze === true,
      });
      if (section === "pinned") pinned.push(thread);
      else if (section === "active") active.push(thread);
    }
    return [...sortPinnedThreadsForSidebar(pinned), ...sortThreadsForSidebar(active)];
  }, [now, serverConfigs, threads]);
}

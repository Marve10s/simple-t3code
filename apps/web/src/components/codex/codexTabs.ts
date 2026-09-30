import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { DraftId } from "../../composerDraftStore";
import { resolveStorage } from "../../lib/storage";

export type CodexTab =
  | {
      readonly kind: "thread";
      readonly key: string;
      readonly environmentId: EnvironmentId;
      readonly threadId: ThreadId;
    }
  | {
      readonly kind: "draft";
      readonly key: string;
      readonly draftId: DraftId;
      readonly threadId: ThreadId;
    };

export function openCodexTab(
  tabs: ReadonlyArray<CodexTab>,
  tab: CodexTab,
  activeKey: string | null,
): ReadonlyArray<CodexTab> {
  if (tabs.some((existing) => existing.key === tab.key)) return tabs;
  if (tab.kind === "thread") {
    const draftIndex = tabs.findIndex(
      (existing) => existing.kind === "draft" && existing.threadId === tab.threadId,
    );
    if (draftIndex !== -1) return tabs.with(draftIndex, tab);
  }
  const activeIndex =
    activeKey === null ? -1 : tabs.findIndex((existing) => existing.key === activeKey);
  const insertAt = activeIndex === -1 ? tabs.length : activeIndex + 1;
  return [...tabs.slice(0, insertAt), tab, ...tabs.slice(insertAt)];
}

export function closeCodexTab(
  tabs: ReadonlyArray<CodexTab>,
  key: string,
): { readonly tabs: ReadonlyArray<CodexTab>; readonly neighbor: CodexTab | null } {
  const index = tabs.findIndex((tab) => tab.key === key);
  if (index === -1) return { tabs, neighbor: null };
  const next = tabs.toSpliced(index, 1);
  return { tabs: next, neighbor: next[index] ?? next[index - 1] ?? null };
}

interface CodexTabsState {
  tabs: ReadonlyArray<CodexTab>;
  setTabs: (tabs: ReadonlyArray<CodexTab>) => void;
}

export const useCodexTabsStore = create<CodexTabsState>()(
  persist(
    (set) => ({
      tabs: [],
      setTabs: (tabs) => set({ tabs }),
    }),
    {
      name: "simplet3code:tabs",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ tabs: state.tabs }),
    },
  ),
);

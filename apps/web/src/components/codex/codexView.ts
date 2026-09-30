import * as Schema from "effect/Schema";

import { useLocalStorage } from "../../hooks/useLocalStorage";

/**
 * How SimpleT3Code lays out threads:
 * - activity: upstream T3 Code sidebar (live thread cards).
 * - projects: projects with their threads, like Codex.
 * - tabs: no sidebar; open chats are browser-style tabs in the top bar.
 */
export const CodexView = Schema.Literals(["activity", "projects", "tabs"]);
export type CodexView = typeof CodexView.Type;
export const decodeCodexView = Schema.decodeUnknownSync(CodexView);

export const CODEX_VIEW_LABELS: Record<CodexView, string> = {
  activity: "Activity",
  projects: "Projects",
  tabs: "Tabs",
};

const CODEX_VIEW_STORAGE_KEY = "simplet3code:view";

export function useCodexView() {
  return useLocalStorage(CODEX_VIEW_STORAGE_KEY, "projects" as CodexView, CodexView);
}

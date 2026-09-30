import * as Schema from "effect/Schema";

import { useLocalStorage } from "../../hooks/useLocalStorage";

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

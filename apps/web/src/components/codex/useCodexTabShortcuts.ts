import { useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import { isCommandPaletteOpen } from "../../commandPaletteBus";
import {
  resolveShortcutCommand,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../../keybindings";
import { isEditableFocused } from "../../lib/editableFocus";
import { isModelPickerOpen } from "../../modelPickerVisibility";
import { isPreviewFocused } from "../../lib/previewFocus";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { selectActiveRightPanel, useRightPanelStore } from "../../rightPanelStore";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../../terminalUiStateStore";
import { resolveAdjacentThreadId } from "../Sidebar.logic";
import { type CodexTab, useCodexTabsStore } from "./codexTabs";

export function useCodexTabShortcuts(activeKey: string | null, openTab: (tab: CodexTab) => void) {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isCommandPaletteOpen() || isModelPickerOpen())
        return;

      const tabs = useCodexTabsStore.getState().tabs;
      const activeTab = tabs.find((tab) => tab.key === activeKey);
      const threadRef = activeTab?.kind === "thread" ? activeTab : null;
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen:
            threadRef !== null &&
            selectThreadTerminalUiState(
              useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
              threadRef,
            ).terminalOpen,
          previewFocus: isPreviewFocused(),
          previewOpen:
            threadRef !== null &&
            selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, threadRef) ===
              "preview",
          editableFocus: isEditableFocused(event.target),
          modelPickerOpen: false,
        },
      });
      const jumpIndex = threadJumpIndexFromCommand(command ?? "");
      const direction = threadTraversalDirectionFromCommand(command);
      if (jumpIndex === null && direction === null) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const targetKey =
        direction === null
          ? null
          : resolveAdjacentThreadId({
              threadIds: tabs.map((tab) => tab.key),
              currentThreadId: activeKey,
              direction,
            });
      const target =
        jumpIndex !== null ? tabs[jumpIndex] : tabs.find((tab) => tab.key === targetKey);
      if (target) openTab(target);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeKey, keybindings, openTab]);
}

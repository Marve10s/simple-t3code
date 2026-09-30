import { SettingsRow } from "../settings/settingsLayout";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { CODEX_VIEW_LABELS, CodexView, decodeCodexView, useCodexView } from "./codexView";

export function CodexViewSetting() {
  const [view, setView] = useCodexView();
  return (
    <SettingsRow
      id="sidebar-view"
      title="Sidebar view"
      description="Activity lists chats by status, Projects groups them by project, and Tabs hides the sidebar and opens chats as tabs."
      control={
        <Select value={view} onValueChange={(value) => setView(decodeCodexView(value))}>
          <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Sidebar view">
            <SelectValue>{CODEX_VIEW_LABELS[view]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {CodexView.literals.map((option) => (
              <SelectItem hideIndicator key={option} value={option}>
                {CODEX_VIEW_LABELS[option]}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

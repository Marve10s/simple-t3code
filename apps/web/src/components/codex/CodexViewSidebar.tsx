import LegacyThreadSidebar from "../LegacySidebar";
import ThreadSidebar from "../Sidebar";
import { useCodexView } from "./codexView";

/**
 * Activity uses upstream's live sidebar; Projects uses upstream's
 * project-grouped sidebar. The tabs view hides the sidebar on desktop widths
 * (simple-codex.css) and keeps Projects for the mobile sheet.
 */
export default function CodexViewSidebar() {
  const [view] = useCodexView();
  return view === "activity" ? <ThreadSidebar /> : <LegacyThreadSidebar />;
}

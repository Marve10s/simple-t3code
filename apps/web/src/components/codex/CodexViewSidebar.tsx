import LegacyThreadSidebar from "../LegacySidebar";
import ThreadSidebar from "../Sidebar";
import { useCodexView } from "./codexView";

export default function CodexViewSidebar() {
  const [view] = useCodexView();
  return view === "activity" ? <ThreadSidebar /> : <LegacyThreadSidebar />;
}

import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { isElectron } from "../../env";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { useCodexView } from "./codexView";

declare module "@tanstack/react-router" {
  interface HistoryState {
    codexTabsClosed?: boolean;
  }
}

export function CodexIndexLanding({ children }: { children: ReactNode }) {
  const [view] = useCodexView();
  const tabsClosed = useLocation({ select: (location) => location.state.codexTabsClosed === true });

  if (view !== "tabs" || !tabsClosed) return children;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      {isElectron ? <WorkspacePageHeader electron /> : null}
      <Empty size="hero" className="flex-1">
        <EmptyHeader>
          <EmptyTitle>No chat selected</EmptyTitle>
          <EmptyDescription>Open a chat or create a new one to get started.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </SidebarInset>
  );
}

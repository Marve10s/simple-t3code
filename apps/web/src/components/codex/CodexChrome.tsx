import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  ActivityIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  FolderTreeIcon,
  HouseIcon,
  LibraryBigIcon,
  PanelTopIcon,
  SearchIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, Suspense, useEffect } from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { isSidebarUtilityPage } from "../sidebar/mainAppLocation";
import { SidebarUpdatePill } from "../sidebar/SidebarUpdatePill";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  LazyMotionEffects,
  LazyMotionRailIndicator,
  LazyMotionTabStrip,
  useCodexAnimationStyle,
} from "./codexAnimations";
import { CodexHeroBackground } from "./CodexHeroBackground";
import { CodexTabStrip } from "./CodexTabStrip";
import { CodexNotificationsMenu } from "./CodexThreadStatus";
import { CODEX_VIEW_LABELS, CodexView, useCodexView } from "./codexView";

function ChromeButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            data-codex-part="chrome-button"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}

export function CodexChromeBar() {
  const [view] = useCodexView();
  const onSettings = useLocation({
    select: (location) => location.pathname.startsWith("/settings"),
  });
  const [animationStyle] = useCodexAnimationStyle();
  const tabsView = view === "tabs";
  const motionEnabled = animationStyle === "motion";

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.codexView = view;
    root.dataset.codexSettings = onSettings ? "true" : "false";
    root.dataset.codexAnimations = animationStyle;
  }, [animationStyle, onSettings, view]);

  return (
    <div
      className={cn(isElectron && "drag-region")}
      data-codex-part="chrome-bar"
      data-codex-chrome-bar=""
    >
      <div data-codex-part="chrome-bar-controls">
        <ChromeButton label="Back" onClick={() => window.history.back()}>
          <ArrowLeftIcon />
        </ChromeButton>
        <ChromeButton label="Forward" onClick={() => window.history.forward()}>
          <ArrowRightIcon />
        </ChromeButton>
        {tabsView && !onSettings ? null : <span data-codex-part="chrome-toggle-slot" />}
        <CodexNotificationsMenu />
        <ChromeButton label="Search" onClick={() => openCommandPalette()}>
          <SearchIcon />
        </ChromeButton>
      </div>
      {tabsView ? (
        motionEnabled ? (
          <Suspense fallback={<CodexTabStrip />}>
            <LazyMotionTabStrip />
          </Suspense>
        ) : (
          <CodexTabStrip />
        )
      ) : null}
      {motionEnabled ? (
        <Suspense fallback={null}>
          <LazyMotionEffects />
        </Suspense>
      ) : null}
      <CodexHeroBackground />
    </div>
  );
}

function RailActiveIndicator({ active }: { active: boolean }) {
  const [animationStyle] = useCodexAnimationStyle();
  if (!active || animationStyle !== "motion") return null;
  return (
    <Suspense fallback={null}>
      <LazyMotionRailIndicator />
    </Suspense>
  );
}

function RailItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : undefined}
            onClick={onClick}
            data-codex-part="rail-button"
          />
        }
      >
        <RailActiveIndicator active={active} />
        <Icon fill={active && Icon === HouseIcon ? "currentColor" : "none"} />
      </TooltipTrigger>
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

const VIEW_ICONS: Record<CodexView, LucideIcon> = {
  activity: ActivityIcon,
  projects: FolderTreeIcon,
  tabs: PanelTopIcon,
};

function RailViewToggle() {
  const [view, setView] = useCodexView();
  const views = CodexView.literals;
  const next = views[(views.indexOf(view) + 1) % views.length] ?? view;
  return (
    <RailItem
      icon={VIEW_ICONS[view]}
      label={`${CODEX_VIEW_LABELS[view]} view. Switch to ${CODEX_VIEW_LABELS[next]}`}
      active={false}
      onClick={() => setView(next)}
    />
  );
}

export function CodexIconRail() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <nav data-codex-part="icon-rail" aria-label="App">
      <RailItem
        icon={HouseIcon}
        label="Home"
        active={!isSidebarUtilityPage(pathname)}
        onClick={() => void navigate({ to: "/" })}
      />
      <RailItem
        icon={LibraryBigIcon}
        label="Pull requests"
        active={pathname === "/pull-requests"}
        onClick={() =>
          void navigate({ to: "/pull-requests", search: readPullRequestListPreferences() })
        }
      />
      <span data-codex-part="rail-spacer" />
      <RailViewToggle />
      <ul data-codex-part="rail-update">
        <SidebarUpdatePill />
      </ul>
      <RailItem
        icon={SettingsIcon}
        label="Settings"
        active={pathname.startsWith("/settings")}
        onClick={() => void navigate({ to: "/settings" })}
      />
    </nav>
  );
}

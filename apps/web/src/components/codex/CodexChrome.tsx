import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChartNoAxesColumnIcon,
  ClockIcon,
  EllipsisIcon,
  HouseIcon,
  LibraryBigIcon,
  RadioTowerIcon,
  SearchIcon,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, Suspense, useEffect } from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { isSidebarUtilityPage } from "../sidebar/mainAppLocation";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
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
import { CODEX_VIEW_LABELS, CodexView, decodeCodexView, useCodexView } from "./codexView";

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

export function CodexIconRail() {
  const navigate = useNavigate();
  const [view, setView] = useCodexView();
  const pathname = useLocation({ select: (location) => location.pathname });
  const onMainApp = !isSidebarUtilityPage(pathname);
  const settingsActive =
    pathname.startsWith("/settings") &&
    pathname !== "/settings/archived" &&
    pathname !== "/settings/connections";

  return (
    <nav data-codex-part="icon-rail" aria-label="App">
      <RailItem
        icon={HouseIcon}
        label="Home"
        active={onMainApp}
        onClick={() => void navigate({ to: "/" })}
      />
      <RailItem
        icon={ClockIcon}
        label="History"
        active={pathname === "/settings/archived"}
        onClick={() => void navigate({ to: "/settings/archived" })}
      />
      <RailItem
        icon={LibraryBigIcon}
        label="Pull requests"
        active={pathname === "/pull-requests"}
        onClick={() =>
          void navigate({ to: "/pull-requests", search: readPullRequestListPreferences() })
        }
      />
      <RailItem
        icon={ChartNoAxesColumnIcon}
        label="Usage"
        active={pathname === "/usage"}
        onClick={() => void navigate({ to: "/usage" })}
      />
      <RailItem
        icon={RadioTowerIcon}
        label="Connections"
        active={pathname === "/settings/connections"}
        onClick={() => void navigate({ to: "/settings/connections" })}
      />
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label="More"
              data-codex-part="rail-button"
              data-active={settingsActive ? "true" : undefined}
            />
          }
        >
          <RailActiveIndicator active={settingsActive} />
          <EllipsisIcon />
        </MenuTrigger>
        <MenuPopup side="right" align="start">
          <MenuGroup>
            <MenuGroupLabel>View</MenuGroupLabel>
            <MenuRadioGroup value={view} onValueChange={(value) => setView(decodeCodexView(value))}>
              {CodexView.literals.map((option) => (
                <MenuRadioItem key={option} value={option}>
                  {CODEX_VIEW_LABELS[option]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
          <MenuSeparator />
          <MenuItem onClick={() => void navigate({ to: "/settings" })}>Settings</MenuItem>
          <MenuItem onClick={() => void navigate({ to: "/settings/providers" })}>
            Providers
          </MenuItem>
          <MenuItem onClick={() => void navigate({ to: "/settings/appearance" })}>
            Appearance
          </MenuItem>
          <MenuItem onClick={() => void navigate({ to: "/settings/keybindings" })}>
            Keyboard shortcuts
          </MenuItem>
        </MenuPopup>
      </Menu>
    </nav>
  );
}

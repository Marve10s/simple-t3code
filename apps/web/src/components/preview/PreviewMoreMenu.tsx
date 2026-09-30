"use client";

import type { DesktopPreviewColorScheme, EnvironmentId } from "@t3tools/contracts";
import { Minus, MoreVertical, Plus as PlusIcon, RotateCcw } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuGroup,
  MenuGroupLabel,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

import { previewBridge } from "./previewBridge";

const COLOR_SCHEME_OPTIONS: ReadonlyArray<{
  value: DesktopPreviewColorScheme;
  label: string;
}> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

interface Props {
  tabId: string | null;
  hasWebContents: boolean;
  zoomFactor: number;
  colorScheme: DesktopPreviewColorScheme;
  deviceToolbarVisible: boolean;
  onToggleDeviceToolbar: () => void;
  nativePictureInPicture: boolean;
  onNativePictureInPicture: () => void;
  environmentId: EnvironmentId;
  profileId: string;
  profileName: string | undefined;
}

export function PreviewMoreMenu({
  tabId,
  hasWebContents,
  zoomFactor,
  colorScheme,
  deviceToolbarVisible,
  onToggleDeviceToolbar,
  nativePictureInPicture,
  onNativePictureInPicture,
  environmentId,
  profileId,
  profileName,
}: Props) {
  if (!previewBridge) return null;
  const bridge = previewBridge;
  const tabDisabled = !tabId || !hasWebContents;
  const callTab = (op: (tabId: string) => Promise<void>) => () => {
    if (!tabId) return;
    void op(tabId).catch(() => undefined);
  };

  const zoomLabel = `${Math.round(zoomFactor * 100)}%`;
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <Button variant="ghost" size="icon-xs" type="button" aria-label="Preview menu" />
              }
            />
          }
        >
          <MoreVertical />
        </TooltipTrigger>
        <TooltipPopup>More</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end" sideOffset={6}>
        <MenuItem onClick={callTab(bridge.hardReload)} disabled={tabDisabled}>
          Hard reload
        </MenuItem>
        <MenuItem onClick={callTab(bridge.openDevTools)} disabled={tabDisabled}>
          Open DevTools
        </MenuItem>
        <MenuItem onClick={onNativePictureInPicture} disabled={tabDisabled}>
          {nativePictureInPicture
            ? "Close separate preview window"
            : "Open separate preview window"}
        </MenuItem>
        <MenuItem onClick={onToggleDeviceToolbar} disabled={tabDisabled}>
          {deviceToolbarVisible ? "Hide device toolbar" : "Show device toolbar"}
        </MenuItem>
        <MenuSub>
          <MenuSubTrigger disabled={tabDisabled}>Appearance</MenuSubTrigger>
          <MenuSubPopup>
            <MenuRadioGroup
              value={colorScheme}
              onValueChange={(value) => {
                if (!tabId) return;
                void bridge
                  .setColorScheme(tabId, value as DesktopPreviewColorScheme)
                  .catch(() => undefined);
              }}
            >
              {COLOR_SCHEME_OPTIONS.map((option) => (
                <MenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>
        <MenuSeparator />
        <MenuItem
          closeOnClick={false}
          onClick={(event: React.MouseEvent) => event.preventDefault()}
          className="justify-between"
          disabled={tabDisabled}
        >
          <span>Zoom</span>
          <span className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              type="button"
              onClick={callTab(bridge.zoomOut)}
              aria-label="Zoom out"
              disabled={tabDisabled}
            >
              <Minus />
            </Button>
            <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
              {zoomLabel}
            </span>
            <Button
              variant="outline"
              size="icon-xs"
              type="button"
              onClick={callTab(bridge.zoomIn)}
              aria-label="Zoom in"
              disabled={tabDisabled}
            >
              <PlusIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              onClick={callTab(bridge.resetZoom)}
              aria-label="Reset zoom"
              disabled={tabDisabled}
            >
              <RotateCcw />
            </Button>
          </span>
        </MenuItem>
        <MenuSeparator />
        <MenuGroup>
          {profileName ? (
            <MenuGroupLabel className="max-w-64">
              <span className="block truncate">Profile: {profileName}</span>
            </MenuGroupLabel>
          ) : null}
          <MenuItem
            onClick={() =>
              void bridge.clearCookies(environmentId, profileId).catch(() => undefined)
            }
          >
            Clear cookies
          </MenuItem>
          <MenuItem
            onClick={() => void bridge.clearCache(environmentId, profileId).catch(() => undefined)}
          >
            Clear cache
          </MenuItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

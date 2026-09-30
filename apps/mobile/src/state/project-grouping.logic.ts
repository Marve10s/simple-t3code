import type { ProjectGroupingSettings } from "@t3tools/client-runtime/state/project-grouping";
import type { SidebarProjectGroupingMode } from "@t3tools/contracts";

import type { Preferences } from "../persistence/mobile-preferences";

export const DEFAULT_MOBILE_PROJECT_GROUPING_SETTINGS: ProjectGroupingSettings = {
  sidebarProjectGroupingMode: "repository",
  sidebarProjectGroupingOverrides: {},
};

export function resolveMobileProjectGroupingSettings(
  preferences: Preferences,
): ProjectGroupingSettings {
  return {
    sidebarProjectGroupingMode:
      preferences.projectGroupingMode ??
      (preferences.projectGroupingEnabled === false ? "separate" : "repository"),
    sidebarProjectGroupingOverrides: {},
  };
}

export function mobileProjectGroupingModePatch(
  mode: SidebarProjectGroupingMode,
): Partial<Preferences> {
  return {
    projectGroupingMode: mode,
    projectGroupingEnabled: mode !== "separate",
  };
}

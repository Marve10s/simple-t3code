import { useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { primaryServerSettingsAtom } from "../state/server";
import { getThemeDefinition, singleAppearanceOf } from "../themePalette";
import { useEnvironmentThemeDefinitions } from "./useEnvironmentTheme";
import { useTheme } from "./useTheme";

const APPLIED_DEFAULT_THEME_STORAGE_PREFIX = "t3code:default-theme-applied:v2:";

export function defaultThemeGeneration(theme: string, setAt: string): string {
  return setAt.length > 0 ? `${theme}@${setAt}` : theme;
}

export function defaultThemeToApply(input: {
  readonly environmentId: string | null;
  readonly defaultTheme: string;
  readonly defaultThemeSetAt: string;
  readonly appliedGeneration: string | null;
  readonly resolves: boolean;
}): string | null {
  if (input.environmentId === null || input.defaultTheme.length === 0) return null;
  const generation = defaultThemeGeneration(input.defaultTheme, input.defaultThemeSetAt);
  if (input.appliedGeneration === generation) return null;
  if (!input.resolves) return null;
  return generation;
}

function readAppliedGeneration(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeAppliedGeneration(storageKey: string, generation: string): void {
  try {
    window.localStorage.setItem(storageKey, generation);
  } catch {}
}

export function useDefaultThemeAdoption(): void {
  const environmentId = useAtomValue(primaryEnvironmentIdAtom);
  const settings = useAtomValue(primaryServerSettingsAtom);
  const { defaultTheme, defaultThemeSetAt } = settings;
  const { setTheme, setAppearanceMode } = useTheme();
  const environmentThemes = useEnvironmentThemeDefinitions();

  useEffect(() => {
    if (typeof window === "undefined" || environmentId === null) return;
    const storageKey = `${APPLIED_DEFAULT_THEME_STORAGE_PREFIX}${environmentId}`;
    const definition = getThemeDefinition(defaultTheme);
    const generation = defaultThemeToApply({
      environmentId,
      defaultTheme,
      defaultThemeSetAt,
      appliedGeneration: readAppliedGeneration(storageKey),
      resolves: definition !== null,
    });
    if (generation === null || definition === null) return;

    if (!setTheme(defaultTheme)) return;
    const half = singleAppearanceOf(definition);
    if (half !== null && !setAppearanceMode(half)) return;
    writeAppliedGeneration(storageKey, generation);
  }, [
    environmentId,
    defaultTheme,
    defaultThemeSetAt,
    environmentThemes,
    setTheme,
    setAppearanceMode,
  ]);
}

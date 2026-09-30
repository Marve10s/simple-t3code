import { useEffect } from "react";

import {
  useClientSettingsHydrated,
  usePrimarySettings,
  useUpdatePrimarySettings,
} from "./hooks/useSettings";
import { resolvePlanAgentHealPatch } from "./modelSelection";

export function PlanAgentSelectionHeal() {
  const planModeEnabled = usePrimarySettings((settings) => settings.planModeEnabled);
  const textGenerationModelSelection = usePrimarySettings(
    (settings) => settings.textGenerationModelSelection,
  );
  const sourceControlWriterModelSelection = usePrimarySettings(
    (settings) => settings.sourceControlWriterModelSelection,
  );
  const settingsHydrated = useClientSettingsHydrated();
  const updateSettings = useUpdatePrimarySettings();

  useEffect(() => {
    if (!settingsHydrated) {
      return;
    }
    const patch = resolvePlanAgentHealPatch({
      planModeEnabled,
      textGenerationModelSelection,
      sourceControlWriterModelSelection,
    });
    if (patch) {
      updateSettings(patch);
    }
  }, [
    planModeEnabled,
    settingsHydrated,
    textGenerationModelSelection,
    sourceControlWriterModelSelection,
    updateSettings,
  ]);

  return null;
}

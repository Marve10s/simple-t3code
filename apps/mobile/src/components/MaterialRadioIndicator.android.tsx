import { Host, RadioButton } from "@expo/ui/jetpack-compose";
import { size } from "@expo/ui/jetpack-compose/modifiers";
import { View } from "react-native";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";

export function MaterialRadioIndicator({ selected }: { readonly selected: boolean }) {
  const { themeAppearance, themeVariables, systemColorsActive } = useAppearancePreferences();
  if (!systemColorsActive) {
    return (
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: themeVariables[selected ? "--color-primary" : "--color-foreground-muted"],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected ? (
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: themeVariables["--color-primary"],
              }}
            />
          ) : null}
        </View>
      </View>
    );
  }
  return (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Host
        colorScheme={themeAppearance}
        ignoreSafeAreaKeyboardInsets
        style={{ width: 24, height: 24 }}
      >
        <RadioButton selected={selected} modifiers={[size(24, 24)]} />
      </Host>
    </View>
  );
}

import IconGitPullRequest from "@tabler/icons-react-native/IconGitPullRequest";
import { SymbolView as ExpoSymbolView } from "expo-symbols";
import { withUniwind } from "uniwind";
import type { AppSymbolViewProps } from "./AppSymbol";

export type { SFSymbol } from "expo-symbols";
export type { AppSymbolName } from "./AppSymbol";

function AppSymbolView(props: AppSymbolViewProps) {
  const name = typeof props.name === "string" ? props.name : props.name.ios;
  if (name === "arrow.triangle.pull") {
    return (
      <IconGitPullRequest
        accessibilityLabel={props.accessibilityLabel}
        color={props.tintColor}
        size={props.size}
        strokeWidth={2}
        style={props.style}
        testID={props.testID}
      />
    );
  }

  return <ExpoSymbolView {...props} />;
}

export const SymbolView = withUniwind(AppSymbolView);

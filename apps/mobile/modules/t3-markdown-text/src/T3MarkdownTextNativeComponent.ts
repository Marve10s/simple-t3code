import codegenNativeComponent from "react-native/Libraries/Utilities/codegenNativeComponent";
import type { ViewProps } from "react-native";
import type {
  BubblingEventHandler,
  Int32,
  WithDefault,
} from "react-native/Libraries/Types/CodegenTypes";

interface TargetedEvent {
  target: Int32;
}

interface TextLayoutEvent extends TargetedEvent {
  lines: string[];
}

interface SelectionChangeEvent extends TargetedEvent {
  start: Int32;
  end: Int32;
}

type EllipsizeMode = "head" | "middle" | "tail" | "clip";

interface NativeProps extends ViewProps {
  contextClipboardConfig?: string;
  numberOfLines?: Int32;
  allowFontScaling?: WithDefault<boolean, true>;
  ellipsizeMode?: WithDefault<EllipsizeMode, "tail">;
  selectable?: boolean;
  onTextLayout?: BubblingEventHandler<TextLayoutEvent>;
  onSelectionChange?: BubblingEventHandler<SelectionChangeEvent>;
}

export default codegenNativeComponent<NativeProps>("T3MarkdownText", {
  excludedPlatforms: ["android"],
});

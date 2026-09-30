import React, { type Ref } from "react";
import {
  findNodeHandle,
  Platform,
  processColor,
  StyleSheet,
  Text as RNText,
  type ColorValue,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { setMarkdownSelectionHandleColor } from "./T3MarkdownTextSelectionModule";
import T3MarkdownTextRunNativeComponent from "./T3MarkdownTextRunNativeComponent";
import T3MarkdownTextNativeComponent from "./T3MarkdownTextNativeComponent";
import { flattenStyles } from "./util";

const TextAncestorContext = React.createContext<[boolean, ViewStyle]>([
  false,
  StyleSheet.create({}),
]);

const textDefaults = {
  allowFontScaling: true,
  selectable: true,
} satisfies TextProps;

const useTextAncestorContext = () => React.useContext(TextAncestorContext);

export type SelectionChangeEvent = {
  nativeEvent: { target: number; start: number; end: number };
};

export type ContextMenuActionEvent = {
  nativeEvent: { target: number; actionIdentifier: string };
};

export type MarkdownTextPrimitiveProps = Omit<TextProps, "onTextLayout"> & {
  nativeTextRef?: Ref<RNText>;
  selectionHandleColor?: ColorValue;
  uiTextView?: boolean;
  contextMenuConfig?: string;
  contextClipboardConfig?: string;
  onContextMenuAction?: (event: ContextMenuActionEvent) => void;
  onSelectionChange?: (event: SelectionChangeEvent) => void;
};

function MarkdownTextPrimitiveChild({
  style,
  children,
  nativeTextRef: _nativeTextRef,
  ...rest
}: MarkdownTextPrimitiveProps) {
  const [isAncestor, rootStyle] = useTextAncestorContext();

  const flattenedStyle = React.useMemo(() => flattenStyles(rootStyle, style), [rootStyle, style]);
  const contextValue = React.useMemo<[boolean, ViewStyle]>(
    () => [true, flattenedStyle],
    [flattenedStyle],
  );
  let childPosition = 0;
  const nativeChildren = React.Children.toArray(children).map((child) => {
    const position = childPosition;
    childPosition += 1;

    if (React.isValidElement(child)) {
      return child;
    }
    if (typeof child !== "string" && typeof child !== "number") {
      return null;
    }

    const text = child.toString();
    return (
      // @ts-expect-error The generated run props do not include inherited Text props.
      <T3MarkdownTextRunNativeComponent
        key={`text-${position}-${text.length}-${text}`}
        style={flattenedStyle}
        text={text}
        {...rest}
      />
    );
  });

  if (!isAncestor) {
    const { onPress: _onPress, onLongPress: _onLongPress, ...containerProps } = rest;
    return (
      <TextAncestorContext.Provider value={contextValue}>
        <T3MarkdownTextNativeComponent
          {...textDefaults}
          {...containerProps}
          style={[flattenedStyle]}
        >
          {nativeChildren}
        </T3MarkdownTextNativeComponent>
      </TextAncestorContext.Provider>
    );
  }

  return <>{nativeChildren}</>;
}

function MarkdownTextPrimitiveInner({ nativeTextRef, ...props }: MarkdownTextPrimitiveProps) {
  const [isAncestor] = useTextAncestorContext();

  if ((!props.selectable || !props.uiTextView) && !isAncestor) {
    return <RNText ref={nativeTextRef} {...props} />;
  }
  return <MarkdownTextPrimitiveChild {...props} />;
}

function AndroidMarkdownText({
  nativeTextRef,
  selectionHandleColor,
  onLayout,
  contextClipboardConfig: _contextClipboardConfig,
  ...props
}: MarkdownTextPrimitiveProps) {
  const textRef = React.useRef<RNText | null>(null);
  React.useImperativeHandle<RNText | null, RNText | null>(nativeTextRef, () => textRef.current, []);
  const color = processColor(selectionHandleColor);
  const applyHandleColor = React.useCallback(() => {
    if (!textRef.current || typeof color !== "number") return;
    const reactTag = findNodeHandle(textRef.current);
    if (reactTag !== null) setMarkdownSelectionHandleColor(reactTag, color);
  }, [color]);

  React.useEffect(applyHandleColor, [applyHandleColor]);

  return (
    <RNText
      ref={textRef}
      {...props}
      onLayout={(event) => {
        applyHandleColor();
        onLayout?.(event);
      }}
    />
  );
}

export function MarkdownTextPrimitive({
  selectionHandleColor,
  ...props
}: MarkdownTextPrimitiveProps) {
  if (Platform.OS === "android" && selectionHandleColor !== undefined) {
    return <AndroidMarkdownText {...props} selectionHandleColor={selectionHandleColor} />;
  }
  if (Platform.OS !== "ios") {
    const { nativeTextRef, contextClipboardConfig: _contextClipboardConfig, ...textProps } = props;
    return <RNText ref={nativeTextRef} {...textProps} />;
  }
  return <MarkdownTextPrimitiveInner {...props} />;
}

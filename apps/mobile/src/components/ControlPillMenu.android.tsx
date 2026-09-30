import * as Haptics from "expo-haptics";
import { cloneElement, isValidElement, type ReactElement } from "react";
import { AndroidAnchoredMenu } from "./AndroidAnchoredMenu";
import type { ControlPillMenuProps } from "./ControlPillMenu.types";

export function ControlPillMenu(props: ControlPillMenuProps) {
  if (props.shouldOpenOnLongPress && isValidElement(props.children)) {
    const child = props.children as ReactElement<{ onLongPress?: () => void }>;
    return (
      <AndroidAnchoredMenu
        actions={props.actions}
        className={props.className}
        title={props.title}
        style={props.style}
        onPressAction={props.onPressAction}
      >
        {(open) =>
          cloneElement(child, {
            onLongPress: () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              open();
            },
          })
        }
      </AndroidAnchoredMenu>
    );
  }
  return (
    <AndroidAnchoredMenu
      actions={props.actions}
      className={props.className}
      title={props.title}
      style={props.style}
      onPressAction={props.onPressAction}
    >
      {props.children}
    </AndroidAnchoredMenu>
  );
}

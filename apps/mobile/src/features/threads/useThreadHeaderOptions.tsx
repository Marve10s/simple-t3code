import { StackActions, useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import type { AppNativeStackNavigationOptions } from "../../native/StackHeader";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import { withNativeGlassHeaderItem } from "../layout/native-glass-header-items";
import {
  ThreadGitControls,
  useThreadGitCenterHeaderItems,
  useThreadGitRightHeaderItems,
} from "./ThreadGitControls";

type NativeHeaderItems = ReadonlyArray<Record<string, unknown>>;

export function useThreadHeaderOptions(props: {
  readonly title: string;
  readonly subtitle: string;
  readonly headerColor: string;
  readonly usesNativeHeaderGlass: boolean;
  readonly gitControls: Parameters<typeof ThreadGitControls>[0];
  readonly onReturnToThread?: () => void;
}) {
  const navigation = useNavigation();
  const { layout, panes, togglePrimarySidebar } = useAdaptiveWorkspaceLayout();
  const threadCenterHeaderItems = useThreadGitCenterHeaderItems(props.gitControls);
  const compactRightHeaderItems = useThreadGitRightHeaderItems(props.gitControls);
  const splitLeftHeaderItems = useMemo<NativeHeaderItems>(
    () => [
      {
        spacing: 18,
        type: "spacing" as const,
      },
      ...(props.onReturnToThread
        ? [
            withNativeGlassHeaderItem({
              accessibilityLabel: "Return to chat",
              icon: { name: "chevron.left", type: "sfSymbol" as const },
              identifier: "thread-left-return",
              onPress: props.onReturnToThread,
              type: "button" as const,
            }),
          ]
        : []),
      withNativeGlassHeaderItem({
        accessibilityLabel: panes.primarySidebarVisible
          ? "Maximize content"
          : "Show thread sidebar",
        icon: {
          name: panes.primarySidebarVisible ? "arrow.up.left.and.arrow.down.right" : "sidebar.left",
          type: "sfSymbol" as const,
        },
        identifier: "thread-left-sidebar",
        onPress: togglePrimarySidebar,
        type: "button" as const,
      }),
      withNativeGlassHeaderItem({
        accessibilityLabel: "New task",
        icon: { name: "square.and.pencil", type: "sfSymbol" as const },
        identifier: "thread-left-new-task",
        onPress: () => navigation.navigate("NewTaskSheet", { screen: "NewTask" }),
        type: "button" as const,
      }),
    ],
    [panes.primarySidebarVisible, props.onReturnToThread, navigation, togglePrimarySidebar],
  );
  const canGoBack = navigation.canGoBack();
  const compactHomeHeaderItems = useMemo<NativeHeaderItems>(
    () => [
      withNativeGlassHeaderItem({
        accessibilityLabel: "Go to threads list",
        icon: { name: "list.bullet", type: "sfSymbol" as const },
        identifier: "thread-left-home",
        onPress: () => navigation.dispatch(StackActions.replace("Home")),
        type: "button" as const,
      }),
    ],
    [navigation],
  );

  const options: AppNativeStackNavigationOptions = {
    headerShown: true,
    headerTitle: props.title,
    headerTitleStyle: props.usesNativeHeaderGlass
      ? {
          fontSize: 17,
          fontWeight: "800",
        }
      : undefined,
    title: props.title,
    headerBackVisible: !layout.usesSplitView,
    unstable_headerLeftItems: layout.usesSplitView
      ? () => splitLeftHeaderItems
      : canGoBack
        ? undefined
        : () => compactHomeHeaderItems,
    unstable_headerRightItems: () =>
      layout.usesSplitView ? threadCenterHeaderItems : compactRightHeaderItems,
    unstable_headerSubtitle: props.usesNativeHeaderGlass ? props.subtitle : undefined,
    contentStyle: undefined,
  };
  return {
    options,
    sidebar: false,
    fallback:
      !layout.usesSplitView && !props.usesNativeHeaderGlass ? (
        <ThreadGitControls {...props.gitControls} showActionControls />
      ) : null,
  };
}

import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { NativeHeaderToolbar } from "../../native/StackHeader";
import { useAuth } from "@clerk/expo";
import { StackActions, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { reportAtomCommandResult, settlePromise } from "@t3tools/client-runtime/state/runtime";
import { AndroidSheetHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text } from "../../components/AppText";
import { useRemoteConnections } from "../../state/use-remote-environment-registry";
import { CloudEnvironmentRows } from "../connection/CloudEnvironmentRows";
import { splitEnvironmentSections } from "../connection/environmentSections";
import { useConnectionController } from "../connection/useConnectionController";
import { optOutOfConnectOnboarding } from "./connectOnboardingOptOut";
import { hasCloudPublicConfig } from "./publicConfig";

export function ConnectOnboardingRouteScreen() {
  const navigation = useNavigation();

  useEffect(() => {
    if (hasCloudPublicConfig()) {
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.dispatch(StackActions.replace("Home"));
    }
  }, [navigation]);

  return hasCloudPublicConfig() ? <ConfiguredConnectOnboardingRouteScreen /> : null;
}

function ConfiguredConnectOnboardingRouteScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const { connectedEnvironments, onSetEnvironmentEnabled, onRemoveEnvironmentPress } =
    useRemoteConnections();
  const { refreshRelayEnvironments } = useConnectionController();
  const { connectedCloudEnvironments } = splitEnvironmentSections({
    connectedEnvironments,
    cloudEnvironments: null,
  });

  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const handlePullRefresh = useCallback(() => {
    void (async () => {
      setIsPullRefreshing(true);
      await refreshRelayEnvironments();
      setIsPullRefreshing(false);
    })();
  }, [refreshRelayEnvironments]);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleDontShowAgain = useCallback(() => {
    void (async () => {
      if (userId) {
        const result = await settlePromise(() => optOutOfConnectOnboarding(userId));
        reportAtomCommandResult(result, { label: "connect onboarding opt-out" });
      }
      navigation.goBack();
    })();
  }, [navigation, userId]);

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <AndroidSheetHeader
          title="Set up T3 Connect"
          actions={[{ accessibilityLabel: "Close", icon: "xmark", onPress: handleClose }]}
        />
      ) : (
        <NativeHeaderToolbar placement="right">
          <NativeHeaderToolbar.Button icon="xmark" onPress={handleClose} separateBackground />
        </NativeHeaderToolbar>
      )}
      <ScrollView
        alwaysBounceVertical
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentInset={{ bottom: Math.max(insets.bottom, 18) + 18 }}
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: 20,
          paddingTop: 16,
        }}
        refreshControl={
          <RefreshControl refreshing={isPullRefreshing} onRefresh={handlePullRefresh} />
        }
      >
        {isSignedIn ? (
          <CloudEnvironmentRows
            connectedCloudEnvironments={connectedCloudEnvironments}
            onSetEnvironmentEnabled={onSetEnvironmentEnabled}
            onRemoveEnvironment={onRemoveEnvironmentPress}
            showHeader={false}
          />
        ) : (
          <View collapsable={false} className="rounded-[24px] bg-card p-5">
            <Text className="text-sm leading-normal text-foreground-muted">
              Sign in to your T3 account to set up T3 Connect.
            </Text>
          </View>
        )}

        {userId ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={handleDontShowAgain}
            className="items-center py-1 active:opacity-70"
          >
            <Text className="text-xs text-foreground-muted">{"Don't show this again"}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

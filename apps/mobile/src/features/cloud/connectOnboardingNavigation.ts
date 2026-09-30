import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";

import { appAtomRegistry } from "../../state/atom-registry";
import { clearConnectOnboardingRequest, connectOnboardingRequestAtom } from "./connectOnboarding";
import { isConnectOnboardingOptedOut } from "./connectOnboardingOptOut";

const PRESENT_ONBOARDING_DELAY_MS = 600;

export function useConnectOnboardingNavigation(): void {
  const navigation = useNavigation();
  const requestedAccountId = useAtomValue(connectOnboardingRequestAtom);

  useEffect(() => {
    if (requestedAccountId === null) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const optedOut = await isConnectOnboardingOptedOut(requestedAccountId).catch(() => false);
        if (cancelled || appAtomRegistry.get(connectOnboardingRequestAtom) !== requestedAccountId) {
          return;
        }
        clearConnectOnboardingRequest();
        if (!optedOut) {
          navigation.navigate("ConnectOnboarding");
        }
      })();
    }, PRESENT_ONBOARDING_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [navigation, requestedAccountId]);
}

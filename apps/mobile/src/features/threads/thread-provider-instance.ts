import { useMemo } from "react";

import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  normalizeProviderAccentColor,
  resolveProviderInstanceDisplayName,
  shouldShowInstanceBadge,
} from "@t3tools/client-runtime/state/provider-instance-display";
import type { EnvironmentId, ProviderDriverKind, ServerConfig } from "@t3tools/contracts";

export interface ThreadRowProviderInstance {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly accentColor?: string | undefined;
  readonly showBadge: boolean;
}

export function resolveThreadProviderInstance(
  serverConfigs: ReadonlyMap<EnvironmentId, ServerConfig>,
  thread: EnvironmentThreadShell,
): ThreadRowProviderInstance | null {
  const providers = serverConfigs.get(thread.environmentId)?.providers ?? [];
  const instanceId = thread.session?.providerInstanceId ?? thread.modelSelection.instanceId;
  const snapshot = providers.find((provider) => provider.instanceId === instanceId);
  if (!snapshot) return null;
  const entry = {
    driverKind: snapshot.driver,
    displayName: resolveProviderInstanceDisplayName(snapshot),
    accentColor: normalizeProviderAccentColor(snapshot.accentColor),
  };
  return {
    ...entry,
    showBadge: shouldShowInstanceBadge(
      entry,
      providers.map((provider) => ({ driverKind: provider.driver })),
    ),
  };
}

export function createThreadRowProviderInstanceResolver(
  serverConfigs: ReadonlyMap<EnvironmentId, ServerConfig>,
): (thread: EnvironmentThreadShell) => ThreadRowProviderInstance | null {
  const cache = new Map<string, ThreadRowProviderInstance | null>();
  return (thread) => {
    const instanceId = thread.session?.providerInstanceId ?? thread.modelSelection.instanceId;
    const cacheKey = `${thread.environmentId}|${instanceId ?? ""}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;
    const resolved = resolveThreadProviderInstance(serverConfigs, thread);
    cache.set(cacheKey, resolved);
    return resolved;
  };
}

export function useThreadRowProviderInstanceResolver(
  serverConfigs: ReadonlyMap<EnvironmentId, ServerConfig>,
): (thread: EnvironmentThreadShell) => ThreadRowProviderInstance | null {
  return useMemo(() => createThreadRowProviderInstanceResolver(serverConfigs), [serverConfigs]);
}

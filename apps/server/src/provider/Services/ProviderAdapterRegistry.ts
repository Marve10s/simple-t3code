import type { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as PubSub from "effect/PubSub";
import type * as Scope from "effect/Scope";

import type { ProviderAdapterError, ProviderUnsupportedError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";
import type { ProviderContinuationIdentity } from "../ProviderDriver.ts";

export interface ProviderInstanceRoutingInfo {
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string | undefined;
  readonly accentColor?: string | undefined;
  readonly enabled: boolean;
  readonly continuationIdentity: ProviderContinuationIdentity;
}

export interface ProviderAdapterRegistryShape {
  readonly getByInstance: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ProviderAdapterShape<ProviderAdapterError>, ProviderUnsupportedError>;

  readonly getInstanceInfo: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ProviderInstanceRoutingInfo, ProviderUnsupportedError>;

  readonly listInstances: () => Effect.Effect<ReadonlyArray<ProviderInstanceId>>;

  readonly subscribeChanges: Effect.Effect<PubSub.Subscription<void>, never, Scope.Scope>;
}

export class ProviderAdapterRegistry extends Context.Service<
  ProviderAdapterRegistry,
  ProviderAdapterRegistryShape
>()("t3/provider/Services/ProviderAdapterRegistry") {}

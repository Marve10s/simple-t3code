import type { ProviderDriverKind, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import type * as Stream from "effect/Stream";
import type { ServerProviderShape } from "./Services/ServerProvider.ts";

export type ProviderSnapshotSource = {
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: ProviderDriverKind;
  readonly getSnapshot: ServerProviderShape["getSnapshot"];
  readonly refresh: ServerProviderShape["refresh"];
  readonly streamChanges: Stream.Stream<ServerProvider>;
};

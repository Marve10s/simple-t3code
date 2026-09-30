import type {
  ProviderConsumeResetCreditOutcome,
  ProviderDriverKind,
  ProviderInstanceEnvironment,
  ProviderInstanceId,
  ServerProvider,
} from "@t3tools/contracts";
import type * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

import type * as TextGeneration from "../textGeneration/TextGeneration.ts";
import type { ProviderAdapterError, ProviderDriverError } from "./Errors.ts";
import type { ProviderAdapterShape } from "./Services/ProviderAdapter.ts";
import type { ServerProviderShape } from "./Services/ServerProvider.ts";
import type { ProviderAuthController } from "./Services/ProviderAuthService.ts";

export interface ProviderDriverMetadata {
  readonly displayName: string;
  readonly supportsMultipleInstances?: boolean;
}

export interface ProviderInstance {
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: ProviderDriverKind;
  readonly continuationIdentity: ProviderContinuationIdentity;
  readonly displayName: string | undefined;
  readonly accentColor?: string | undefined;
  readonly enabled: boolean;
  readonly snapshot: ServerProviderShape;
  readonly snapshotForCwd?: (cwd: string) => Effect.Effect<ServerProvider, ProviderDriverError>;
  readonly refreshModels?: () => Effect.Effect<void, ProviderDriverError>;
  readonly invalidateCaches?: Effect.Effect<void>;
  readonly consumeResetCredit?: () => Effect.Effect<
    ProviderConsumeResetCreditOutcome,
    ProviderDriverError
  >;
  readonly adapter: ProviderAdapterShape<ProviderAdapterError>;
  readonly textGeneration: TextGeneration.TextGeneration["Service"];
  readonly auth?: ProviderAuthController;
}

export interface ProviderContinuationIdentity {
  readonly driverKind: ProviderDriverKind;
  readonly continuationKey: string;
}

export function defaultProviderContinuationIdentity(input: {
  readonly driverKind: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId;
}): ProviderContinuationIdentity {
  return {
    driverKind: input.driverKind,
    continuationKey: `${input.driverKind}:instance:${input.instanceId}`,
  };
}

export interface ProviderDriverCreateInput<Config> {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string | undefined;
  readonly accentColor?: string | undefined;
  readonly environment: ProviderInstanceEnvironment;
  readonly enabled: boolean;
  readonly config: Config;
}

export interface ProviderDriver<Config, R = never> {
  readonly driverKind: ProviderDriverKind;
  readonly metadata: ProviderDriverMetadata;
  readonly configSchema: Schema.Codec<Config, unknown>;
  readonly defaultConfig: () => Config;
  readonly create: (
    input: ProviderDriverCreateInput<Config>,
  ) => Effect.Effect<ProviderInstance, ProviderDriverError, R | Scope.Scope>;
}

export type AnyProviderDriver<R = never> = ProviderDriver<any, R>;

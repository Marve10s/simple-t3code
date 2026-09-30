import type {
  DeviceHostId,
  DeviceHostSummary,
  DevicePlatform,
  DevicePlatformAvailability,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { NodeRuntimeUnavailableError } from "@t3tools/shared/nodeRuntime";

export class DeviceHostError extends Schema.TaggedError<DeviceHostError>()("DeviceHostError", {
  hostId: Schema.String,
  step: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Device host ${this.hostId} failed while ${this.step}.`;
  }
}

export class DeviceHostTimeoutError extends Schema.TaggedError<DeviceHostTimeoutError>()(
  "DeviceHostTimeoutError",
  { hostId: Schema.String, timeoutMs: Schema.Number },
) {
  override get message(): string {
    return `Device host ${this.hostId} did not start agent tools within ${this.timeoutMs} ms.`;
  }
}

export interface DeviceHubEndpoint {
  readonly origin: string;
}

export interface AgentDeviceEndpoint {
  readonly baseUrl: string;
  readonly token: string;
  readonly entryPath: string;
}

export interface DeviceHostReady {
  readonly nodePath: string;
  readonly hub: DeviceHubEndpoint;
  readonly run: (
    command: string,
    args: ReadonlyArray<string>,
    options?: { readonly timeoutMs?: number; readonly stdin?: string },
  ) => Effect.Effect<{ readonly stdout: string; readonly stderr: string; readonly code: number }>;
  readonly helpers: {
    readonly serveSimAxSettings: string | null;
    readonly serveSimCli: string | null;
  };
}

export interface DeviceHostAgentReady extends DeviceHostReady {
  readonly agentDevice: AgentDeviceEndpoint;
}

export class DeviceHost extends Context.Service<
  DeviceHost,
  {
    readonly id: DeviceHostId;
    readonly summary: Effect.Effect<DeviceHostSummary>;
    readonly inspect?: Effect.Effect<DeviceHostSummary, DeviceHostError>;
    readonly platformAvailability: (
      platform: DevicePlatform,
    ) => Effect.Effect<DevicePlatformAvailability>;
    readonly ensureReady: (
      onPhase: (phase: "installing" | "starting", detail?: string) => Effect.Effect<void>,
    ) => Effect.Effect<DeviceHostReady, DeviceHostError | NodeRuntimeUnavailableError>;
    readonly ensureAgentReady: (
      onPhase: (phase: "installing" | "starting", detail?: string) => Effect.Effect<void>,
    ) => Effect.Effect<
      DeviceHostAgentReady,
      DeviceHostError | DeviceHostTimeoutError | NodeRuntimeUnavailableError
    >;
    readonly current: Effect.Effect<DeviceHostReady | null>;
    readonly stopAgent: Effect.Effect<void>;
    readonly stop: Effect.Effect<void>;
  }
>()("t3/device/DeviceHost") {}

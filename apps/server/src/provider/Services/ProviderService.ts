import type {
  ProviderInterruptTurnInput,
  ProviderInstanceId,
  ProviderRespondToRequestInput,
  ProviderRespondToUserInputInput,
  ProviderRuntimeEvent,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderStopSessionInput,
  ProviderUploadFeedbackInput,
  ProviderUploadFeedbackResult,
  MessageId,
  ThreadId,
  ProviderTurnStartResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

import type { ProviderServiceError } from "../Errors.ts";
import type { ProviderAdapterCapabilities } from "./ProviderAdapter.ts";
import type { ProviderInstanceRoutingInfo } from "./ProviderAdapterRegistry.ts";

export interface ProviderServiceShape {
  readonly startSession: (
    threadId: ThreadId,
    input: ProviderSessionStartInput,
  ) => Effect.Effect<ProviderSession, ProviderServiceError>;

  readonly sendTurn: (
    input: ProviderSendTurnInput,
  ) => Effect.Effect<ProviderTurnStartResult, ProviderServiceError>;

  readonly compactThread: (
    threadId: ThreadId,
    modelSelection?: ProviderSendTurnInput["modelSelection"],
    requestId?: MessageId,
  ) => Effect.Effect<void, ProviderServiceError>;

  readonly interruptTurn: (
    input: ProviderInterruptTurnInput,
  ) => Effect.Effect<void, ProviderServiceError>;

  readonly respondToRequest: (
    input: ProviderRespondToRequestInput,
  ) => Effect.Effect<void, ProviderServiceError>;

  readonly respondToUserInput: (
    input: ProviderRespondToUserInputInput,
  ) => Effect.Effect<void, ProviderServiceError>;

  readonly stopSession: (
    input: ProviderStopSessionInput,
  ) => Effect.Effect<void, ProviderServiceError>;

  readonly listSessions: () => Effect.Effect<ReadonlyArray<ProviderSession>>;

  readonly getCapabilities: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ProviderAdapterCapabilities, ProviderServiceError>;

  readonly getInstanceInfo: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ProviderInstanceRoutingInfo, ProviderServiceError>;

  readonly assertConversationRollbackSupported: (
    threadId: ThreadId,
  ) => Effect.Effect<void, ProviderServiceError>;

  readonly rollbackConversation: (input: {
    readonly threadId: ThreadId;
    readonly numTurns: number;
  }) => Effect.Effect<void, ProviderServiceError>;

  readonly uploadFeedback: (
    input: ProviderUploadFeedbackInput,
  ) => Effect.Effect<ProviderUploadFeedbackResult, ProviderServiceError>;

  readonly streamEvents: Stream.Stream<ProviderRuntimeEvent>;
}

export class ProviderService extends Context.Service<ProviderService, ProviderServiceShape>()(
  "t3/provider/Services/ProviderService",
) {}

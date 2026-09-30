import type {
  ApprovalRequestId,
  ProviderApprovalDecision,
  ProviderDriverKind,
  ProviderUserInputAnswers,
  ProviderRuntimeEvent,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderUploadFeedbackInput,
  ProviderUploadFeedbackResult,
  ThreadId,
  ProviderTurnStartResult,
  TurnId,
} from "@t3tools/contracts";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

export type ProviderSessionModelSwitchMode = "in-session" | "unsupported";

export type ProviderCompaction<TError> =
  | {
      readonly type: "native";
      readonly start: (
        threadId: ThreadId,
        modelSelection?: ProviderSendTurnInput["modelSelection"],
      ) => Effect.Effect<void, TError>;
    }
  | { readonly type: "slash-command"; readonly command: `/${string}` };

export interface ProviderAdapterCapabilities {
  readonly sessionModelSwitch: ProviderSessionModelSwitchMode;
  readonly promptlessTurnContinuation?: boolean;
  readonly supportsConversationRollback?: boolean;
}

export interface ProviderThreadTurnSnapshot {
  readonly id: TurnId;
  readonly items: ReadonlyArray<unknown>;
}

export interface ProviderThreadSnapshot {
  readonly threadId: ThreadId;
  readonly turns: ReadonlyArray<ProviderThreadTurnSnapshot>;
}

export interface ProviderAdapterShape<TError> {
  readonly provider: ProviderDriverKind;
  readonly capabilities: ProviderAdapterCapabilities;

  readonly startSession: (
    input: ProviderSessionStartInput,
  ) => Effect.Effect<ProviderSession, TError>;

  readonly sendTurn: (
    input: ProviderSendTurnInput,
  ) => Effect.Effect<ProviderTurnStartResult, TError>;

  readonly compaction?: ProviderCompaction<TError>;

  readonly interruptTurn: (threadId: ThreadId, turnId?: TurnId) => Effect.Effect<void, TError>;

  readonly respondToRequest: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Effect.Effect<void, TError>;

  readonly respondToUserInput: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers,
  ) => Effect.Effect<void, TError>;

  readonly stopSession: (threadId: ThreadId) => Effect.Effect<void, TError>;

  readonly listSessions: () => Effect.Effect<ReadonlyArray<ProviderSession>>;

  readonly hasSession: (threadId: ThreadId) => Effect.Effect<boolean>;

  readonly readThread: (threadId: ThreadId) => Effect.Effect<ProviderThreadSnapshot, TError>;

  readonly rollbackThread: (
    threadId: ThreadId,
    numTurns: number,
  ) => Effect.Effect<ProviderThreadSnapshot, TError>;

  readonly uploadFeedback?: (
    input: ProviderUploadFeedbackInput,
  ) => Effect.Effect<ProviderUploadFeedbackResult, TError>;

  readonly stopAll: () => Effect.Effect<void, TError>;

  readonly streamEvents: Stream.Stream<ProviderRuntimeEvent>;
}

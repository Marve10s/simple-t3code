import {
  ChatAttachment,
  MessageId,
  OrchestrationMessageContext,
  OrchestrationMessageRole,
  ThreadId,
  TurnId,
  IsoDateTime,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import * as Struct from "effect/Struct";
import type * as Option from "effect/Option";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionThreadMessage = Schema.Struct({
  messageId: MessageId,
  threadId: ThreadId,
  turnId: Schema.NullOr(TurnId),
  role: OrchestrationMessageRole,
  text: Schema.String,
  attachments: Schema.optional(Schema.Array(ChatAttachment)),
  context: Schema.optional(OrchestrationMessageContext),
  isStreaming: Schema.Boolean,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ProjectionThreadMessage = typeof ProjectionThreadMessage.Type;

export const AppendStreamingProjectionThreadMessage = Schema.Struct(
  Struct.omit(ProjectionThreadMessage.fields, ["isStreaming"]),
);
export type AppendStreamingProjectionThreadMessage =
  typeof AppendStreamingProjectionThreadMessage.Type;

export const ListProjectionThreadMessagesInput = Schema.Struct({
  threadId: ThreadId,
});
export type ListProjectionThreadMessagesInput = typeof ListProjectionThreadMessagesInput.Type;

export const GetProjectionThreadMessageInput = Schema.Struct({
  messageId: MessageId,
});
export type GetProjectionThreadMessageInput = typeof GetProjectionThreadMessageInput.Type;

export const HasProjectionThreadAssistantMessageInput = Schema.Struct({
  threadId: ThreadId,
  turnId: TurnId,
  streamingOnly: Schema.Boolean,
});
export type HasProjectionThreadAssistantMessageInput =
  typeof HasProjectionThreadAssistantMessageInput.Type;

export const DeleteProjectionThreadMessagesInput = Schema.Struct({
  threadId: ThreadId,
});
export type DeleteProjectionThreadMessagesInput = typeof DeleteProjectionThreadMessagesInput.Type;

export interface ProjectionThreadMessageRepositoryShape {
  readonly upsert: (
    message: ProjectionThreadMessage,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly appendStreaming: (
    message: AppendStreamingProjectionThreadMessage,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly getByMessageId: (
    input: GetProjectionThreadMessageInput,
  ) => Effect.Effect<Option.Option<ProjectionThreadMessage>, ProjectionRepositoryError>;

  readonly hasAssistantMessageForTurn: (
    input: HasProjectionThreadAssistantMessageInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly listByThreadId: (
    input: ListProjectionThreadMessagesInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionThreadMessage>, ProjectionRepositoryError>;

  readonly getLatestUserMessageAt: (
    input: ListProjectionThreadMessagesInput,
  ) => Effect.Effect<ProjectionThreadMessage["createdAt"] | null, ProjectionRepositoryError>;

  readonly deleteByThreadId: (
    input: DeleteProjectionThreadMessagesInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionThreadMessageRepository extends Context.Service<
  ProjectionThreadMessageRepository,
  ProjectionThreadMessageRepositoryShape
>()("t3/persistence/Services/ProjectionThreadMessages/ProjectionThreadMessageRepository") {}

import {
  EventId,
  IsoDateTime,
  NonNegativeInt,
  OrchestrationThreadActivityTone,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionThreadActivity = Schema.Struct({
  activityId: EventId,
  threadId: ThreadId,
  turnId: Schema.NullOr(TurnId),
  tone: OrchestrationThreadActivityTone,
  kind: Schema.String,
  summary: Schema.String,
  payload: Schema.Unknown,
  sequence: Schema.optional(NonNegativeInt),
  createdAt: IsoDateTime,
});
export type ProjectionThreadActivity = typeof ProjectionThreadActivity.Type;

export const ListProjectionThreadActivitiesInput = Schema.Struct({
  threadId: ThreadId,
  activityKinds: Schema.optional(Schema.Array(Schema.String)),
  limit: Schema.optional(NonNegativeInt),
});
export type ListProjectionThreadActivitiesInput = typeof ListProjectionThreadActivitiesInput.Type;

export const GetLatestProjectionThreadTaskActivityInput = Schema.Struct({
  threadId: ThreadId,
  taskId: Schema.String,
});
export type GetLatestProjectionThreadTaskActivityInput =
  typeof GetLatestProjectionThreadTaskActivityInput.Type;

export const DeleteProjectionThreadActivitiesInput = Schema.Struct({
  threadId: ThreadId,
});
export type DeleteProjectionThreadActivitiesInput =
  typeof DeleteProjectionThreadActivitiesInput.Type;

export interface ProjectionThreadActivityRepositoryShape {
  readonly upsert: (
    row: ProjectionThreadActivity,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly listByThreadId: (
    input: ListProjectionThreadActivitiesInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionThreadActivity>, ProjectionRepositoryError>;

  readonly listUserInputLifecycleByThreadId: (
    input: ListProjectionThreadActivitiesInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionThreadActivity>, ProjectionRepositoryError>;

  readonly getLatestTaskActivity: (
    input: GetLatestProjectionThreadTaskActivityInput,
  ) => Effect.Effect<Option.Option<ProjectionThreadActivity>, ProjectionRepositoryError>;

  readonly deleteByThreadId: (
    input: DeleteProjectionThreadActivitiesInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionThreadActivityRepository extends Context.Service<
  ProjectionThreadActivityRepository,
  ProjectionThreadActivityRepositoryShape
>()("t3/persistence/Services/ProjectionThreadActivities/ProjectionThreadActivityRepository") {}

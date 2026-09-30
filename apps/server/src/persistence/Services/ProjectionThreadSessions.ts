import {
  RuntimeMode,
  IsoDateTime,
  OrchestrationSessionStatus,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionThreadSession = Schema.Struct({
  threadId: ThreadId,
  status: OrchestrationSessionStatus,
  providerName: Schema.NullOr(Schema.String),
  providerInstanceId: Schema.NullOr(ProviderInstanceId),
  runtimeMode: RuntimeMode,
  activeTurnId: Schema.NullOr(TurnId),
  lastError: Schema.NullOr(Schema.String),
  updatedAt: IsoDateTime,
});
export type ProjectionThreadSession = typeof ProjectionThreadSession.Type;

export const GetProjectionThreadSessionInput = Schema.Struct({
  threadId: ThreadId,
});
export type GetProjectionThreadSessionInput = typeof GetProjectionThreadSessionInput.Type;

export const DeleteProjectionThreadSessionInput = Schema.Struct({
  threadId: ThreadId,
});
export type DeleteProjectionThreadSessionInput = typeof DeleteProjectionThreadSessionInput.Type;

export interface ProjectionThreadSessionRepositoryShape {
  readonly upsert: (row: ProjectionThreadSession) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly getByThreadId: (
    input: GetProjectionThreadSessionInput,
  ) => Effect.Effect<Option.Option<ProjectionThreadSession>, ProjectionRepositoryError>;

  readonly deleteByThreadId: (
    input: DeleteProjectionThreadSessionInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionThreadSessionRepository extends Context.Service<
  ProjectionThreadSessionRepository,
  ProjectionThreadSessionRepositoryShape
>()("t3/persistence/Services/ProjectionThreadSessions/ProjectionThreadSessionRepository") {}

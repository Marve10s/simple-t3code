import { IsoDateTime, NonNegativeInt } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionState = Schema.Struct({
  projector: Schema.String,
  lastAppliedSequence: NonNegativeInt,
  updatedAt: IsoDateTime,
});
export type ProjectionState = typeof ProjectionState.Type;

export const GetProjectionStateInput = Schema.Struct({
  projector: Schema.String,
});
export type GetProjectionStateInput = typeof GetProjectionStateInput.Type;

export interface ProjectionStateRepositoryShape {
  readonly upsert: (row: ProjectionState) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly upsertMany: (
    rows: ReadonlyArray<ProjectionState>,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly getByProjector: (
    input: GetProjectionStateInput,
  ) => Effect.Effect<Option.Option<ProjectionState>, ProjectionRepositoryError>;

  readonly listAll: () => Effect.Effect<ReadonlyArray<ProjectionState>, ProjectionRepositoryError>;
}

export class ProjectionStateRepository extends Context.Service<
  ProjectionStateRepository,
  ProjectionStateRepositoryShape
>()("t3/persistence/Services/ProjectionState/ProjectionStateRepository") {}

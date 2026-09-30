import {
  IsoDateTime,
  ModelSelection,
  ProjectIconOverride,
  ProjectId,
  ProjectScript,
  ThreadEnvMode,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionProject = Schema.Struct({
  projectId: ProjectId,
  title: Schema.String,
  workspaceRoot: Schema.String,
  defaultModelSelection: Schema.NullOr(ModelSelection),
  defaultThreadEnvMode: Schema.NullOr(ThreadEnvMode),
  autoPull: Schema.Boolean,
  faviconPath: Schema.optional(Schema.NullOr(Schema.String)),
  projectIcon: Schema.optional(Schema.NullOr(ProjectIconOverride)),
  scripts: Schema.Array(ProjectScript),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: Schema.NullOr(IsoDateTime),
});
export type ProjectionProject = typeof ProjectionProject.Type;

export const GetProjectionProjectInput = Schema.Struct({
  projectId: ProjectId,
});
export type GetProjectionProjectInput = typeof GetProjectionProjectInput.Type;

export interface ProjectionProjectRepositoryShape {
  readonly upsert: (row: ProjectionProject) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly getById: (
    input: GetProjectionProjectInput,
  ) => Effect.Effect<Option.Option<ProjectionProject>, ProjectionRepositoryError>;
}

export class ProjectionProjectRepository extends Context.Service<
  ProjectionProjectRepository,
  ProjectionProjectRepositoryShape
>()("t3/persistence/Services/ProjectionProjects/ProjectionProjectRepository") {}

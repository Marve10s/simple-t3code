import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export interface OrchestrationProjectionPipelineShape {
  readonly bootstrap: Effect.Effect<void, ProjectionRepositoryError>;

  readonly projectEvent: (
    event: OrchestrationEvent,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly projectEventDeferred: (
    event: OrchestrationEvent,
  ) => Effect.Effect<Effect.Effect<void>, ProjectionRepositoryError>;
}

export class OrchestrationProjectionPipeline extends Context.Service<
  OrchestrationProjectionPipeline,
  OrchestrationProjectionPipelineShape
>()("t3/orchestration/Services/ProjectionPipeline/OrchestrationProjectionPipeline") {}

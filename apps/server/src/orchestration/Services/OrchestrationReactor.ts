import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface OrchestrationReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
}

export class OrchestrationReactor extends Context.Service<
  OrchestrationReactor,
  OrchestrationReactorShape
>()("t3/orchestration/Services/OrchestrationReactor") {}

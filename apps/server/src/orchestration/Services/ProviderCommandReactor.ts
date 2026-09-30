import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface ProviderCommandReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  readonly drain: Effect.Effect<void>;
}

export class ProviderCommandReactor extends Context.Service<
  ProviderCommandReactor,
  ProviderCommandReactorShape
>()("t3/orchestration/Services/ProviderCommandReactor") {}

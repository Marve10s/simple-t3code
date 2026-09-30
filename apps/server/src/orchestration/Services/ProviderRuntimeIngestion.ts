import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface ProviderRuntimeIngestionShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  readonly drain: Effect.Effect<void>;
}

export class ProviderRuntimeIngestionService extends Context.Service<
  ProviderRuntimeIngestionService,
  ProviderRuntimeIngestionShape
>()("t3/orchestration/Services/ProviderRuntimeIngestion/ProviderRuntimeIngestionService") {}

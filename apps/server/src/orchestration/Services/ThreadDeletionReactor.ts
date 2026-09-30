import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface ThreadDeletionReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  readonly drainThrough: (sequence: number) => Effect.Effect<void>;
}

export class ThreadDeletionReactor extends Context.Service<
  ThreadDeletionReactor,
  ThreadDeletionReactorShape
>()("t3/orchestration/Services/ThreadDeletionReactor") {}

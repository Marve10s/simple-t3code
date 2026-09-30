import type {
  OrchestrationClientOrigin,
  OrchestrationCommand,
  OrchestrationEvent,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type * as Stream from "effect/Stream";

import type { OrchestrationDispatchError } from "../Errors.ts";
import type { OrchestrationEventStoreError } from "../../persistence/Errors.ts";
import type { OrchestrationAggregateReplayStats } from "../../persistence/Services/OrchestrationEventStore.ts";

export interface OrchestrationThreadReplayRange {
  readonly threadId: ThreadId;
  readonly fromSequenceExclusive: number;
  readonly toSequenceInclusive: number;
}

export interface OrchestrationEngineShape {
  readonly readEvents: (
    fromSequenceExclusive: number,
    limit?: number,
  ) => Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError, never>;

  readonly readThreadEvents: (
    input: OrchestrationThreadReplayRange & { readonly limit?: number },
  ) => Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError>;

  readonly getThreadReplayStats: (
    input: OrchestrationThreadReplayRange & { readonly maxEvents: number },
  ) => Effect.Effect<OrchestrationAggregateReplayStats, OrchestrationEventStoreError>;

  readonly dispatch: (
    command: OrchestrationCommand,
    options?: { readonly origin?: OrchestrationClientOrigin },
  ) => Effect.Effect<{ sequence: number }, OrchestrationDispatchError, never>;

  readonly streamDomainEvents: Stream.Stream<OrchestrationEvent>;

  readonly subscribeDomainEvents: Effect.Effect<
    Stream.Stream<OrchestrationEvent>,
    never,
    Scope.Scope
  >;

  readonly latestSequence: Effect.Effect<number, never, never>;
}

export class OrchestrationEngineService extends Context.Service<
  OrchestrationEngineService,
  OrchestrationEngineShape
>()("t3/orchestration/Services/OrchestrationEngine/OrchestrationEngineService") {}

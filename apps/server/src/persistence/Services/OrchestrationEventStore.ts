import { OrchestrationEvent } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

import type { OrchestrationEventStoreError } from "../Errors.ts";

export interface OrchestrationAggregateReplayRange {
  readonly aggregateKind: OrchestrationEvent["aggregateKind"];
  readonly aggregateId: string;
  readonly fromSequenceExclusive: number;
  readonly toSequenceInclusive: number;
}

export interface OrchestrationAggregateReplayStats {
  readonly eventCount: number;
  readonly payloadBytes: number;
  readonly hasCreateEvent: boolean;
}

export interface OrchestrationEventStoreShape {
  readonly append: (
    event: Omit<OrchestrationEvent, "sequence">,
  ) => Effect.Effect<OrchestrationEvent, OrchestrationEventStoreError>;

  readonly readFromSequence: (
    sequenceExclusive: number,
    limit?: number,
  ) => Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError>;

  readonly readAggregateRange: (
    input: OrchestrationAggregateReplayRange & { readonly limit?: number },
  ) => Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError>;

  readonly getAggregateReplayStats: (
    input: OrchestrationAggregateReplayRange & { readonly maxEvents: number },
  ) => Effect.Effect<OrchestrationAggregateReplayStats, OrchestrationEventStoreError>;

  readonly readAll: () => Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError>;

  readonly hasEventAfter: (input: {
    readonly aggregateKind: OrchestrationEvent["aggregateKind"];
    readonly aggregateId: string;
    readonly type?: OrchestrationEvent["type"];
    readonly sequenceExclusive: number;
  }) => Effect.Effect<boolean, OrchestrationEventStoreError>;
}

export class OrchestrationEventStore extends Context.Service<
  OrchestrationEventStore,
  OrchestrationEventStoreShape
>()("t3/persistence/Services/OrchestrationEventStore") {}

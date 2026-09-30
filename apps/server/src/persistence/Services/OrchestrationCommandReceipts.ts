import {
  CommandId,
  IsoDateTime,
  NonNegativeInt,
  OrchestrationAggregateKind,
  OrchestrationCommandReceiptStatus,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { OrchestrationCommandReceiptRepositoryError } from "../Errors.ts";

export const OrchestrationCommandReceipt = Schema.Struct({
  commandId: CommandId,
  aggregateKind: OrchestrationAggregateKind,
  aggregateId: Schema.Union([ProjectId, ThreadId]),
  acceptedAt: IsoDateTime,
  resultSequence: NonNegativeInt,
  status: OrchestrationCommandReceiptStatus,
  error: Schema.NullOr(Schema.String),
});
export type OrchestrationCommandReceipt = typeof OrchestrationCommandReceipt.Type;

export const GetByCommandIdInput = Schema.Struct({
  commandId: CommandId,
});
export type GetByCommandIdInput = typeof GetByCommandIdInput.Type;

export interface OrchestrationCommandReceiptRepositoryShape {
  readonly upsert: (
    receipt: OrchestrationCommandReceipt,
  ) => Effect.Effect<void, OrchestrationCommandReceiptRepositoryError>;

  readonly getByCommandId: (
    input: GetByCommandIdInput,
  ) => Effect.Effect<
    Option.Option<OrchestrationCommandReceipt>,
    OrchestrationCommandReceiptRepositoryError
  >;
}

export class OrchestrationCommandReceiptRepository extends Context.Service<
  OrchestrationCommandReceiptRepository,
  OrchestrationCommandReceiptRepositoryShape
>()("t3/persistence/Services/OrchestrationCommandReceipts/OrchestrationCommandReceiptRepository") {}

import {
  ApprovalRequestId,
  IsoDateTime,
  ProjectionPendingApprovalDecision,
  ProjectionPendingApprovalStatus,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionPendingApproval = Schema.Struct({
  requestId: ApprovalRequestId,
  threadId: ThreadId,
  turnId: Schema.NullOr(TurnId),
  status: ProjectionPendingApprovalStatus,
  decision: ProjectionPendingApprovalDecision,
  createdAt: IsoDateTime,
  resolvedAt: Schema.NullOr(IsoDateTime),
});
export type ProjectionPendingApproval = typeof ProjectionPendingApproval.Type;

export const ListProjectionPendingApprovalsInput = Schema.Struct({
  threadId: ThreadId,
});
export type ListProjectionPendingApprovalsInput = typeof ListProjectionPendingApprovalsInput.Type;

export const GetProjectionPendingApprovalInput = Schema.Struct({
  requestId: ApprovalRequestId,
});
export type GetProjectionPendingApprovalInput = typeof GetProjectionPendingApprovalInput.Type;

export interface ProjectionPendingApprovalRepositoryShape {
  readonly upsert: (
    row: ProjectionPendingApproval,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly listByThreadId: (
    input: ListProjectionPendingApprovalsInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionPendingApproval>, ProjectionRepositoryError>;

  readonly countPendingByThreadId: (
    input: ListProjectionPendingApprovalsInput,
  ) => Effect.Effect<number, ProjectionRepositoryError>;

  readonly getByRequestId: (
    input: GetProjectionPendingApprovalInput,
  ) => Effect.Effect<Option.Option<ProjectionPendingApproval>, ProjectionRepositoryError>;

  readonly deleteByThreadId: (
    input: ListProjectionPendingApprovalsInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionPendingApprovalRepository extends Context.Service<
  ProjectionPendingApprovalRepository,
  ProjectionPendingApprovalRepositoryShape
>()("t3/persistence/Services/ProjectionPendingApprovals/ProjectionPendingApprovalRepository") {}

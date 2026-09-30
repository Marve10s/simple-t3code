import type {
  AgentSessionImportSource,
  ApprovalRequestId,
  CheckpointRef,
  MessageId,
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  OrchestrationProject,
  OrchestrationProjectShell,
  OrchestrationReadModel,
  OrchestrationSearchThreadsInput,
  OrchestrationSearchThreadsResult,
  OrchestrationShellSnapshot,
  OrchestrationThread,
  OrchestrationThreadActivity,
  OrchestrationThreadDetailSnapshot,
  OrchestrationThreadDetailWindow,
  OrchestrationThreadShell,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Option from "effect/Option";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export interface ProjectionSnapshotCounts {
  readonly projectCount: number;
  readonly threadCount: number;
}

export interface ProjectionSnapshotSequence {
  readonly snapshotSequence: number;
}

export interface ProjectionEventReplayStats {
  readonly eventCount: number;
  readonly payloadBytes: number;
}

export interface ProjectionThreadCheckpointContext {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly workspaceRoot: string;
  readonly worktreePath: string | null;
  readonly checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>;
}

export interface ProjectionFullThreadDiffContext {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly workspaceRoot: string;
  readonly worktreePath: string | null;
  readonly latestCheckpointTurnCount: number;
  readonly toCheckpointRef: CheckpointRef | null;
}

export type ProjectionThreadPullRequests = Pick<
  OrchestrationThreadShell,
  "id" | "projectId" | "settledOverride" | "settledAt" | "pullRequests"
>;

export interface ProjectionThreadDetailQuery {
  readonly activityKinds?: ReadonlyArray<string>;
}

export interface ProjectionSnapshotQueryShape {
  readonly getUserInputActivity: (input: {
    readonly threadId: ThreadId;
    readonly requestId: ApprovalRequestId;
  }) => Effect.Effect<Option.Option<OrchestrationThreadActivity>, ProjectionRepositoryError>;

  readonly listActivitiesByKind: (
    kind: string,
  ) => Effect.Effect<ReadonlyArray<OrchestrationThreadActivity>, ProjectionRepositoryError>;

  readonly getCommandReadModel: () => Effect.Effect<
    OrchestrationReadModel,
    ProjectionRepositoryError
  >;

  readonly getSnapshot: () => Effect.Effect<OrchestrationReadModel, ProjectionRepositoryError>;

  readonly getShellSnapshot: (options?: {
    readonly unsettledOnly?: boolean;
  }) => Effect.Effect<OrchestrationShellSnapshot, ProjectionRepositoryError>;

  readonly getArchivedShellSnapshot: () => Effect.Effect<
    OrchestrationShellSnapshot,
    ProjectionRepositoryError
  >;

  readonly listThreadsWithPullRequests: () => Effect.Effect<
    ReadonlyArray<ProjectionThreadPullRequests>,
    ProjectionRepositoryError
  >;

  readonly getDeletedWorktreeThreads: () => Effect.Effect<
    ReadonlyArray<{
      readonly id: ThreadId;
      readonly projectId: ProjectId;
      readonly branch: string;
      readonly worktreePath: string;
      readonly workspaceRoot: string;
      readonly deletedAt: string;
    }>,
    ProjectionRepositoryError
  >;

  readonly searchThreads: (
    input: OrchestrationSearchThreadsInput,
  ) => Effect.Effect<OrchestrationSearchThreadsResult, ProjectionRepositoryError>;

  readonly getSnapshotSequence: () => Effect.Effect<
    ProjectionSnapshotSequence,
    ProjectionRepositoryError
  >;

  readonly getCounts: () => Effect.Effect<ProjectionSnapshotCounts, ProjectionRepositoryError>;

  readonly getEventReplayStats: (input: {
    readonly fromSequenceExclusive: number;
    readonly toSequenceInclusive: number;
  }) => Effect.Effect<ProjectionEventReplayStats, ProjectionRepositoryError>;

  readonly getActiveProjectByWorkspaceRoot: (
    workspaceRoot: string,
  ) => Effect.Effect<Option.Option<OrchestrationProject>, ProjectionRepositoryError>;

  readonly getProjectShellById: (
    projectId: ProjectId,
  ) => Effect.Effect<Option.Option<OrchestrationProjectShell>, ProjectionRepositoryError>;

  readonly getProjectShells: (
    projectIds?: ReadonlyArray<ProjectId>,
  ) => Effect.Effect<ReadonlyArray<OrchestrationProjectShell>, ProjectionRepositoryError>;

  readonly getFirstActiveThreadIdByProjectId: (
    projectId: ProjectId,
  ) => Effect.Effect<Option.Option<ThreadId>, ProjectionRepositoryError>;

  readonly getImportedAgentSessionSources: (projectId: ProjectId) => Effect.Effect<
    ReadonlyArray<{
      readonly threadId: ThreadId;
      readonly source: AgentSessionImportSource;
    }>,
    ProjectionRepositoryError
  >;

  readonly getThreadCheckpointContext: (
    threadId: ThreadId,
  ) => Effect.Effect<Option.Option<ProjectionThreadCheckpointContext>, ProjectionRepositoryError>;

  readonly getFullThreadDiffContext: (
    threadId: ThreadId,
    toTurnCount: number,
  ) => Effect.Effect<Option.Option<ProjectionFullThreadDiffContext>, ProjectionRepositoryError>;

  readonly getThreadShellById: (
    threadId: ThreadId,
  ) => Effect.Effect<Option.Option<OrchestrationThreadShell>, ProjectionRepositoryError>;

  readonly getThreadRuntimeContext: (
    threadId: ThreadId,
  ) => Effect.Effect<
    Option.Option<
      Pick<OrchestrationThreadShell, "id" | "projectId" | "title" | "titleState" | "session">
    >,
    ProjectionRepositoryError
  >;

  readonly getTurnStartMessage: (input: {
    readonly threadId: ThreadId;
    readonly messageId: MessageId;
  }) => Effect.Effect<
    Option.Option<{
      readonly message: OrchestrationMessage;
      readonly hasOtherUserMessages: boolean;
    }>,
    ProjectionRepositoryError
  >;

  readonly getThreadDetailById: (
    threadId: ThreadId,
    query?: ProjectionThreadDetailQuery,
  ) => Effect.Effect<Option.Option<OrchestrationThread>, ProjectionRepositoryError>;

  readonly getThreadDetailSnapshot: (
    threadId: ThreadId,
    window?: OrchestrationThreadDetailWindow,
  ) => Effect.Effect<Option.Option<OrchestrationThreadDetailSnapshot>, ProjectionRepositoryError>;
}

export class ProjectionSnapshotQuery extends Context.Service<
  ProjectionSnapshotQuery,
  ProjectionSnapshotQueryShape
>()("t3/orchestration/Services/ProjectionSnapshotQuery") {}

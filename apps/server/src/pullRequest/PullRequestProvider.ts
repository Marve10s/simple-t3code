import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type {
  PullRequestStackMembership,
  PullRequestAction,
  PullRequestStackHead,
  PullRequestActor,
  PullRequestBaseComparison,
  PullRequestCapabilities,
  PullRequestChecksState,
  PullRequestCheck,
  PullRequestComment,
  PullRequestFileViewed,
  PullRequestCommit,
  PullRequestInvolvement,
  PullRequestLabel,
  PullRequestListFilters,
  PullRequestListState,
  PullRequestMergeCapabilities,
  PullRequestMergeMethod,
  PullRequestMergeability,
  PullRequestOmittedFileStat,
  PullRequestReaction,
  PullRequestReactionContent,
  PullRequestReviewCommentDraft,
  PullRequestReviewDecision,
  PullRequestReviewThread,
  PullRequestThreadCommentsResult,
  PullRequestReviewVerdict,
  PullRequestReviewerCandidateList,
  PullRequestReviewerKind,
  PullRequestLabelCandidateList,
  PullRequestState,
  PullRequestPreview,
  PullRequestUpdateMethod,
  PullRequestViewerPermissions,
  SourceControlProviderKind,
} from "@t3tools/contracts";
import { SourceControlProviderKind as SourceControlProviderKindSchema } from "@t3tools/contracts";

export class PullRequestProviderError extends Schema.TaggedError<PullRequestProviderError>()(
  "PullRequestProviderError",
  {
    provider: SourceControlProviderKindSchema,
    operation: Schema.String,
    reason: Schema.Literals(["missing-tool", "unauthenticated", "rate-limited", "failed"]),
    detail: Schema.String,
    retryAt: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `${this.provider} failed in ${this.operation}: ${this.detail}`;
  }
}

export interface PullRequestProviderFailure {
  readonly reason: PullRequestProviderError["reason"];
  readonly retryAt?: number | undefined;
}

export interface ProviderChangeRequest {
  readonly stack?: PullRequestStackMembership;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly author: PullRequestActor | null;
  readonly headBranch: string;
  readonly headRepositoryNameWithOwner?: string | null;
  readonly baseBranch: string;
  readonly state: PullRequestState;
  readonly isDraft: boolean;
  readonly mergeability: PullRequestMergeability;
  readonly additions: number;
  readonly deletions: number;
  readonly createdAt: string;
  readonly closedAt?: string | null;
  readonly mergedAt?: string | null;
  readonly updatedAt: string;
  readonly reviewRequestLogins: ReadonlyArray<string>;
  readonly labels: ReadonlyArray<PullRequestLabel>;
  readonly reviewDecision?: PullRequestReviewDecision | null | undefined;
  readonly checksState?: PullRequestChecksState | null | undefined;
}

export interface ProviderChangeRequestSummary {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly state: PullRequestState;
  readonly isDraft?: boolean;
  readonly closedAt?: string | null;
  readonly mergedAt?: string | null;
  readonly updatedAt: string;
  readonly author?: PullRequestActor | null | undefined;
  readonly additions?: number | undefined;
  readonly deletions?: number | undefined;
  readonly changedFiles?: number | undefined;
  readonly reviewDecision?: PullRequestReviewDecision | null | undefined;
  readonly checksState?: PullRequestChecksState | null | undefined;
  readonly mergeability?: PullRequestMergeability | undefined;
}

export interface ProviderChangeRequestStackLayer {
  readonly title?: string;
  readonly isDraft?: boolean;
  readonly headSha?: string;
  readonly number: number;
  readonly headBranch: string;
  readonly state: PullRequestState;
}

export interface ProviderChangeRequestStack {
  readonly id: string;
  readonly number: number;
  readonly url: string;
  readonly base: string;
  readonly layers: ReadonlyArray<ProviderChangeRequestStackLayer>;
}

export interface ProviderChangeRequestPage {
  readonly items: ReadonlyArray<ProviderChangeRequest>;
  readonly truncated: boolean;
  readonly cursorAdvance?: number;
  readonly continues: boolean;
}

export interface ProviderListCursor {
  readonly updatedBefore: string;
  readonly delivered: number;
}

export interface ProviderBatchedChangeRequest extends ProviderChangeRequest {
  readonly repository: string;
}

export interface ProviderBatchedChangeRequestPage {
  readonly items: ReadonlyArray<ProviderBatchedChangeRequest>;
  readonly truncated: boolean;
}

export interface ProviderChangeRequestStat {
  readonly repository: string;
  readonly number: number;
  readonly additions: number;
  readonly deletions: number;
}

export interface ProviderChangeRequestDetail extends ProviderChangeRequest {
  readonly body: string;
  readonly changedFiles: number;
  readonly mergedAt: string | null;
  readonly closedAt: string | null;
  readonly reviewers: ReadonlyArray<PullRequestActor>;
  readonly checks: ReadonlyArray<PullRequestCheck>;
  readonly mergeCapabilities: PullRequestMergeCapabilities;
  readonly viewerPermissions: PullRequestViewerPermissions;
  readonly baseComparison?: PullRequestBaseComparison;
  readonly behindBy?: number;
  readonly autoMergeEnabled?: boolean;
  readonly autoMergeMethod?: PullRequestMergeMethod;
  readonly workflowApprovalsRequired?: number;
}

export interface ProviderChangeRequestActivity {
  readonly author?: PullRequestActor | null;
  readonly reviewers?: ReadonlyArray<PullRequestActor>;
  readonly comments: ReadonlyArray<PullRequestComment>;
  readonly commentCount: number;
  readonly commentsTruncated: boolean;
  readonly reviewThreads: ReadonlyArray<PullRequestReviewThread>;
  readonly commits: ReadonlyArray<PullRequestCommit>;
  readonly reactions?: ReadonlyArray<PullRequestReaction>;
}

export interface ProviderDiffSlice {
  readonly patch: string;
  readonly truncated: boolean;
  readonly nextCursor: string | null;
  readonly omittedFileStats?: ReadonlyArray<PullRequestOmittedFileStat>;
}

export interface ProviderDiffFileContents {
  readonly oldContents: string;
  readonly newContents: string;
}

export interface ProviderFilesViewed {
  readonly files: ReadonlyArray<PullRequestFileViewed>;
  readonly truncated: boolean;
}

export interface ProviderFileRevisions {
  readonly revisions: ReadonlyMap<string, string>;
  readonly complete?: boolean;
}

export interface ProviderRepositoryRef {
  readonly cwd: string;
  readonly repository: string;
  readonly host: string;
}

export interface PullRequestProviderApi {
  readonly withVerifiedCredential?: <A, E, R>(
    input: { readonly cwd: string; readonly host: string },
    use: (identity: {
      readonly accountId: string;
      readonly viewer: string;
      readonly credentialFingerprint: string;
    }) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PullRequestProviderError, R>;
  readonly getRoutingIdentity?: (input: {
    readonly cwd: string;
    readonly host: string;
  }) => Effect.Effect<
    { readonly accountId: string; readonly viewer: string },
    PullRequestProviderError
  >;
  readonly kind: SourceControlProviderKind;
  readonly capabilities: PullRequestCapabilities;

  readonly getViewer: (input: {
    readonly cwd: string;
    readonly host?: string;
  }) => Effect.Effect<string, PullRequestProviderError>;

  readonly listChangeRequests: (
    input: ProviderRepositoryRef & {
      readonly state: PullRequestListState;
      readonly involvement: PullRequestInvolvement;
      readonly viewer: string;
      readonly limit: number;
      readonly query?: string | undefined;
      readonly cursor?: ProviderListCursor | undefined;
      readonly filters?: PullRequestListFilters | undefined;
    },
  ) => Effect.Effect<ProviderChangeRequestPage, PullRequestProviderError>;

  readonly listChangeRequestsAcross?: (input: {
    readonly cwd: string;
    readonly host: string;
    readonly repositories: ReadonlyArray<string>;
    readonly state: PullRequestListState;
    readonly involvement: PullRequestInvolvement;
    readonly viewer: string;
    readonly limit: number;
    readonly query?: string | undefined;
    readonly cursor?: ProviderListCursor | undefined;
    readonly filters?: PullRequestListFilters | undefined;
  }) => Effect.Effect<ProviderBatchedChangeRequestPage, PullRequestProviderError>;

  readonly listAuthoredChangeRequests?: (input: {
    readonly cwd: string;
    readonly host: string;
    readonly repository?: string | undefined;
    readonly state: PullRequestListState;
    readonly viewer: string;
    readonly limit: number;
    readonly query?: string | undefined;
    readonly cursor?: string | undefined;
    readonly filters?: PullRequestListFilters | undefined;
  }) => Effect.Effect<
    ProviderBatchedChangeRequestPage & { readonly nextCursor: string | null },
    PullRequestProviderError
  >;

  readonly listChangeRequestStats?: (input: {
    readonly cwd: string;
    readonly host: string;
    readonly changeRequests: ReadonlyArray<{
      readonly repository: string;
      readonly number: number;
    }>;
  }) => Effect.Effect<ReadonlyArray<ProviderChangeRequestStat>, PullRequestProviderError>;

  readonly getChangeRequest: (
    input: ProviderRepositoryRef & { readonly number: number },
  ) => Effect.Effect<ProviderChangeRequestDetail, PullRequestProviderError>;

  readonly getChangeRequestPreview?: (
    input: ProviderRepositoryRef & { readonly number: number },
  ) => Effect.Effect<
    Omit<PullRequestPreview, "projectId" | "repository">,
    PullRequestProviderError
  >;

  readonly getChangeRequestSummary?: (
    input: ProviderRepositoryRef & { readonly number: number },
  ) => Effect.Effect<ProviderChangeRequestSummary, PullRequestProviderError>;

  readonly getChangeRequestStack?: (
    input: ProviderRepositoryRef & { readonly includeDetails?: boolean; readonly number: number },
  ) => Effect.Effect<ProviderChangeRequestStack | null, PullRequestProviderError>;

  readonly getChangeRequestActivity: (
    input: ProviderRepositoryRef & { readonly number: number },
  ) => Effect.Effect<ProviderChangeRequestActivity, PullRequestProviderError>;

  readonly getReviewThreadComments?: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly threadId: string;
      readonly cursor: string;
    },
  ) => Effect.Effect<PullRequestThreadCommentsResult, PullRequestProviderError>;

  readonly getViewerPermissions: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly includeUpdateBranch?: boolean;
    },
  ) => Effect.Effect<PullRequestViewerPermissions, PullRequestProviderError>;

  readonly getDiff: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly cursor?: string | undefined;
      readonly commit?: string | undefined;
    },
  ) => Effect.Effect<ProviderDiffSlice, PullRequestProviderError>;

  readonly getDiffFileContents?: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly commit?: string | undefined;
      readonly changeType: "change" | "rename-pure" | "rename-changed" | "new" | "deleted";
      readonly oldPath: string;
      readonly newPath: string;
    },
  ) => Effect.Effect<ProviderDiffFileContents, PullRequestProviderError>;

  readonly getFilesViewed?: (
    input: ProviderRepositoryRef & { readonly number: number },
  ) => Effect.Effect<ProviderFilesViewed, PullRequestProviderError>;

  readonly setFilesViewed?: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly files: ReadonlyArray<{ readonly path: string; readonly viewed: boolean }>;
    },
  ) => Effect.Effect<void, PullRequestProviderError>;

  readonly getFileRevisions?: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly paths: ReadonlyArray<string>;
    },
  ) => Effect.Effect<ProviderFileRevisions, PullRequestProviderError>;

  readonly runAction: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly action: PullRequestAction;
      readonly stackNumber?: number;
      readonly expectedStackHeads?: ReadonlyArray<PullRequestStackHead>;
      readonly mergeMethod?: PullRequestMergeMethod;
      readonly updateMethod?: PullRequestUpdateMethod;
    },
  ) => Effect.Effect<void, PullRequestProviderError>;

  readonly updateChangeRequest?: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly title?: string | undefined;
      readonly body?: string | undefined;
    },
  ) => Effect.Effect<void, PullRequestProviderError>;

  readonly comment: (
    input: ProviderRepositoryRef & { readonly number: number; readonly body: string },
  ) => Effect.Effect<void, PullRequestProviderError>;

  readonly updateComment?: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly commentId: string;
      readonly kind: "issue-comment" | "review-comment";
      readonly body: string;
    },
  ) => Effect.Effect<void, PullRequestProviderError>;

  readonly submitReview: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly verdict: PullRequestReviewVerdict;
      readonly body: string;
      readonly comments: ReadonlyArray<PullRequestReviewCommentDraft>;
    },
  ) => Effect.Effect<void, PullRequestProviderError>;

  readonly listReviewerCandidates: (
    input: ProviderRepositoryRef & { readonly number: number },
  ) => Effect.Effect<PullRequestReviewerCandidateList, PullRequestProviderError>;

  readonly setReviewerRequest: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly reviewers: ReadonlyArray<{
        readonly id: string;
        readonly kind: PullRequestReviewerKind;
      }>;
      readonly requested: boolean;
    },
  ) => Effect.Effect<void, PullRequestProviderError>;

  readonly listLabelCandidates?: (
    input: ProviderRepositoryRef & { readonly number: number },
  ) => Effect.Effect<PullRequestLabelCandidateList, PullRequestProviderError>;

  readonly setLabels?: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly labels: ReadonlyArray<string>;
      readonly applied: boolean;
    },
  ) => Effect.Effect<void, PullRequestProviderError>;

  readonly replyToThread: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly threadId: string;
      readonly body: string;
    },
  ) => Effect.Effect<void, PullRequestProviderError>;

  readonly setReaction: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly subjectId?: string | undefined;
      readonly content: PullRequestReactionContent;
      readonly reacted: boolean;
    },
  ) => Effect.Effect<void, PullRequestProviderError>;

  readonly setThreadResolution: (
    input: ProviderRepositoryRef & {
      readonly number: number;
      readonly threadId: string;
      readonly resolved: boolean;
    },
  ) => Effect.Effect<void, PullRequestProviderError>;
}

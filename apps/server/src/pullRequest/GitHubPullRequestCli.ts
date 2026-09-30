import { runGitHubStackAction, type GitHubStackActionError } from "./githubStackActions.ts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Clock from "effect/Clock";
import * as NodeCrypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Request from "effect/Request";
import * as RequestResolver from "effect/RequestResolver";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import {
  resolvePullRequestAuthorFilter,
  PositiveInt,
  TrimmedNonEmptyString,
  type PullRequestAction,
  type PullRequestStackHead,
  type PullRequestActor,
  type PullRequestFileViewed,
  type PullRequestInvolvement,
  type PullRequestListFilters,
  type PullRequestListState,
  type PullRequestMergeMethod,
  type PullRequestOmittedFileStat,
  type PullRequestReaction,
  type PullRequestReactionContent,
  type PullRequestReviewCommentDraft,
  type PullRequestReviewVerdict,
  type PullRequestReviewerCandidateList,
  type PullRequestReviewerKind,
  type PullRequestLabelCandidateList,
  type PullRequestThreadCommentsResult,
  type PullRequestUpdateMethod,
  type PullRequestPreview,
} from "@t3tools/contracts";

import * as GitHubCli from "../sourceControl/GitHubCli.ts";
import * as GitHubGraphQlBudget from "../sourceControl/githubGraphQlBudget.ts";
import * as SourceControlRateLimit from "../sourceControl/SourceControlRateLimit.ts";
import {
  ACTOR_AVATARS_GRAPHQL_QUERY,
  ADD_REACTION_GRAPHQL_MUTATION,
  buildReviewSubmissionJson,
  buildReviewerRequestJson,
  buildSetFilesViewedGraphQlMutation,
  decodeActorAvatarsJson,
  decodePullRequestActivityJson,
  decodePullRequestDetailJson,
  decodePullRequestCoreJson,
  PULL_REQUEST_CORE_GRAPHQL_QUERY,
  type GitHubPullRequestCore,
  type GitHubPullRequestSummary,
  decodePullRequestPreviewJson,
  PULL_REQUEST_PREVIEW_GRAPHQL_QUERY,
  decodePullRequestFilesJson,
  decodePullRequestFilesViewedJson,
  decodePullRequestHeadsJson,
  decodePullRequestListJson,
  decodePullRequestNodeIdJson,
  decodePullRequestSearchJson,
  decodePullRequestStacksJson,
  decodePullRequestStatsJson,
  decodePullRequestSummariesJson,
  decodeReactionSubjectScopeJson,
  decodeReviewerCandidatesJson,
  decodeLabelCandidatesJson,
  buildLabelRequestJson,
  LABEL_CANDIDATES_GRAPHQL_QUERY,
  decodeReviewDismissalsJson,
  decodeReviewThreadCommentsJson,
  decodeReviewThreadsJson,
  buildPullRequestStatsGraphQlQuery,
  buildPullRequestSummariesGraphQlQuery,
  buildPullRequestStackMembershipsGraphQlQuery,
  decodePullRequestStackMembershipsJson,
  encodeGraphQlRequestJson,
  pullRequestSearchGraphQlQuery,
  PULL_REQUEST_SEARCH_MAX_ROWS,
  PULL_REQUEST_ACTIVITY_JSON_FIELDS,
  BASE_COMPARISON_GRAPHQL_QUERY,
  decodeBaseComparisonJson,
  PULL_REQUEST_DETAIL_JSON_FIELDS,
  PULL_REQUEST_LIST_JSON_FIELDS,
  PULL_REQUEST_FILES_VIEWED_GRAPHQL_QUERY,
  PULL_REQUEST_NODE_ID_GRAPHQL_QUERY,
  REACTION_SUBJECT_PULL_REQUEST_GRAPHQL_QUERY,
  REMOVE_REACTION_GRAPHQL_MUTATION,
  REVERT_PULL_REQUEST_GRAPHQL_MUTATION,
  gitHubReactionContent,
  RESOLVE_REVIEW_THREAD_GRAPHQL_MUTATION,
  REVIEWER_CANDIDATES_GRAPHQL_QUERY,
  REVIEW_THREAD_COMMENTS_GRAPHQL_QUERY,
  REVIEW_DISMISSALS_GRAPHQL_QUERY,
  REVIEW_THREAD_REPLY_GRAPHQL_MUTATION,
  REVIEW_THREADS_GRAPHQL_QUERY,
  reviewThreadConversation,
  UNRESOLVE_REVIEW_THREAD_GRAPHQL_MUTATION,
  UPDATE_ISSUE_COMMENT_GRAPHQL_MUTATION,
  UPDATE_PULL_REQUEST_GRAPHQL_MUTATION,
  UPDATE_REVIEW_COMMENT_GRAPHQL_MUTATION,
  VIEWER_PERMISSIONS_GRAPHQL_QUERY,
  decodeViewerPermissionsJson,
  decodeWorkflowRunApprovalsJson,
  type GitHubBaseComparison,
  type GitHubPullRequestActivity,
  type GitHubPullRequestHead,
  type GitHubPullRequestListItem,
  type GitHubPullRequestSearchItem,
  type GitHubPullRequestStack,
  type GitHubReviewThreadComments,
  type GitHubRepositoryAccess,
  type GitHubWorkflowRunApproval,
  type GitHubReviewThreadEntry,
  type GitHubReviewThreadPage,
  type GitHubViewerAccess,
} from "./gitHubPullRequestJson.ts";
import type { ProviderChangeRequestSummary, ProviderListCursor } from "./PullRequestProvider.ts";

export class GitHubPullRequestReadError extends Schema.TaggedError<GitHubPullRequestReadError>()(
  "GitHubPullRequestReadError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {
  get detail(): string {
    return `GitHub CLI returned an unreadable ${this.operation} response.`;
  }

  override get message(): string {
    return `GitHub CLI failed in ${this.operation}: ${this.detail}`;
  }
}

export class GitHubViewerLoginUnavailableError extends Schema.TaggedError<GitHubViewerLoginUnavailableError>()(
  "GitHubViewerLoginUnavailableError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
  },
) {
  get detail(): string {
    return "GitHub CLI returned no login for the authenticated account.";
  }

  override get message(): string {
    return `GitHub CLI failed in getViewerLogin: ${this.detail}`;
  }
}

export class GitHubPullRequestUpdatedAtUnavailableError extends Schema.TaggedError<GitHubPullRequestUpdatedAtUnavailableError>()(
  "GitHubPullRequestUpdatedAtUnavailableError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
    repository: Schema.String,
    number: Schema.Int,
  },
) {
  get detail(): string {
    return `Pull request ${this.repository}#${this.number} reported no update time.`;
  }

  override get message(): string {
    return `GitHub CLI failed in getPullRequestSummary: ${this.detail}`;
  }
}

export class GitHubDiffCursorError extends Schema.TaggedError<GitHubDiffCursorError>()(
  "GitHubDiffCursorError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
  },
) {
  get detail(): string {
    return "The diff cursor was not one this pull request handed out.";
  }

  override get message(): string {
    return `GitHub CLI failed in getPullRequestDiff: ${this.detail}`;
  }
}

export class GitHubDiffCommitError extends Schema.TaggedError<GitHubDiffCommitError>()(
  "GitHubDiffCommitError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
  },
) {
  get detail(): string {
    return "The named commit was not a commit sha.";
  }

  override get message(): string {
    return `GitHub CLI failed in getPullRequestDiff: ${this.detail}`;
  }
}

export class GitHubDiffRevisionsUnavailableError extends Schema.TaggedError<GitHubDiffRevisionsUnavailableError>()(
  "GitHubDiffRevisionsUnavailableError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
    number: Schema.Int,
    commit: Schema.optional(Schema.String),
  },
) {
  get detail(): string {
    return this.commit === undefined
      ? `Pull request #${this.number} reported no usable base and head revisions.`
      : `Commit ${this.commit} reported no usable revisions for this file.`;
  }

  override get message(): string {
    return `GitHub CLI failed in getPullRequestDiffFileContents: ${this.detail}`;
  }
}

export class GitHubDiffFileContentsUnavailableError extends Schema.TaggedError<GitHubDiffFileContentsUnavailableError>()(
  "GitHubDiffFileContentsUnavailableError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
    path: Schema.String,
    reason: Schema.Literals(["oversized", "binary"]),
  },
) {
  get detail(): string {
    return this.reason === "oversized"
      ? `The diff file '${this.path}' exceeds the 1 MB expansion limit.`
      : `The diff file '${this.path}' is binary.`;
  }

  override get message(): string {
    return `GitHub CLI failed in getPullRequestDiffFileContents: ${this.detail}`;
  }
}

export class GitHubRepositorySelectorError extends Schema.TaggedError<GitHubRepositorySelectorError>()(
  "GitHubRepositorySelectorError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
    operation: Schema.String,
  },
) {
  get detail(): string {
    return "A repository was named that GitHub cannot address.";
  }

  override get message(): string {
    return `GitHub CLI failed in ${this.operation}: ${this.detail}`;
  }
}

export class GitHubSubjectScopeError extends Schema.TaggedError<GitHubSubjectScopeError>()(
  "GitHubSubjectScopeError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
    operation: Schema.String,
  },
) {
  get detail(): string {
    return "The named subject did not belong to the named pull request.";
  }

  override get message(): string {
    return `GitHub CLI failed in ${this.operation}: ${this.detail}`;
  }
}

export class GitHubWorkflowApprovalRefusedError extends Schema.TaggedError<GitHubWorkflowApprovalRefusedError>()(
  "GitHubWorkflowApprovalRefusedError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
    number: Schema.Int,
    reason: Schema.Literals(["head-list-truncated", "head-not-unique", "run-list-truncated"]),
    observedCount: Schema.Int,
    limit: Schema.Int,
  },
) {
  get detail(): string {
    if (this.reason === "head-list-truncated") {
      return `GitHub returned more than ${this.limit} pull requests for this head branch.`;
    }
    if (this.reason === "head-not-unique") {
      return `The head revision matched ${this.observedCount} pull requests instead of uniquely matching #${this.number}.`;
    }
    return `GitHub returned more than ${this.limit} workflow runs awaiting approval.`;
  }

  override get message(): string {
    return `GitHub CLI refused listWorkflowRunsRequiringApproval: ${this.detail}`;
  }
}

export class GitHubWorkflowApprovalHeadUnavailableError extends Schema.TaggedError<GitHubWorkflowApprovalHeadUnavailableError>()(
  "GitHubWorkflowApprovalHeadUnavailableError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
    number: Schema.Int,
  },
) {
  get detail(): string {
    return `GitHub did not report a complete head revision for #${this.number}.`;
  }

  override get message(): string {
    return `GitHub CLI refused approve-workflows: ${this.detail}`;
  }
}

export class GitHubWorkflowApprovalHeadChangedError extends Schema.TaggedError<GitHubWorkflowApprovalHeadChangedError>()(
  "GitHubWorkflowApprovalHeadChangedError",
  {
    command: Schema.Literal("gh"),
    cwd: Schema.String,
    number: Schema.Int,
  },
) {
  get detail(): string {
    return `The head revision of #${this.number} changed before its workflows could be approved.`;
  }

  override get message(): string {
    return `GitHub CLI refused approve-workflows: ${this.detail}`;
  }
}

export type GitHubPullRequestCliError =
  | GitHubStackActionError
  | GitHubCli.GitHubCliError
  | GitHubPullRequestReadError
  | GitHubDiffCursorError
  | GitHubDiffCommitError
  | GitHubDiffRevisionsUnavailableError
  | GitHubDiffFileContentsUnavailableError
  | GitHubRepositorySelectorError
  | GitHubSubjectScopeError
  | GitHubWorkflowApprovalRefusedError
  | GitHubWorkflowApprovalHeadUnavailableError
  | GitHubWorkflowApprovalHeadChangedError
  | SourceControlRateLimit.SourceControlRateLimitPausedError
  | GitHubViewerLoginUnavailableError
  | GitHubPullRequestUpdatedAtUnavailableError;

const DIFF_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const DIFF_TIMEOUT_MS = 60_000;
const DIFF_FILE_MAX_OUTPUT_BYTES = 1024 * 1024;

const PULL_REQUEST_FALLBACK_MAX_ROWS = 1_000;

const DIFF_FILES_PAGE_SIZE = 100;
const FILES_VIEWED_MAX_PAGES = 5;

const NODE_ID_CACHE_CAPACITY = 128;

const REVIEW_THREAD_PAGES = 10;

export interface GitHubPullRequestListBatch {
  readonly items: ReadonlyArray<GitHubPullRequestListItem>;
  readonly truncated: boolean;
  readonly continues: boolean;
}

export interface GitHubPullRequestStat {
  readonly repository: string;
  readonly number: number;
  readonly additions: number;
  readonly deletions: number;
}

const STAT_ALIASES_PER_REQUEST = 25;
const STAT_REQUEST_CONCURRENCY = 4;
const SUMMARY_BATCH_WINDOW = "10 millis";

class PullRequestSummaryRead extends Request.Class<
  {
    readonly cwd: string;
    readonly repository: string;
    readonly host: string;
    readonly number: number;
  },
  ProviderChangeRequestSummary,
  GitHubPullRequestCliError
> {}

export interface GitHubPullRequestSearchBatch {
  readonly items: ReadonlyArray<GitHubPullRequestSearchItem>;
  readonly truncated: boolean;
  readonly nextCursor: string | null;
}

export interface GitHubPullRequestDiffSlice {
  readonly patch: string;
  readonly truncated: boolean;
  readonly nextCursor: string | null;
  readonly omittedFileStats?: ReadonlyArray<PullRequestOmittedFileStat>;
}

export interface GitHubPullRequestFilesViewed {
  readonly files: ReadonlyArray<PullRequestFileViewed>;
  readonly truncated: boolean;
}

export class GitHubPullRequestCli extends Context.Service<
  GitHubPullRequestCli,
  {
    readonly withVerifiedCredential: <A, E, R>(
      input: { readonly cwd: string; readonly host: string },
      use: (identity: {
        readonly accountId: string;
        readonly viewer: string;
        readonly credentialFingerprint: string;
      }) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | GitHubPullRequestCliError, R>;
    readonly getRoutingIdentity: (input: {
      readonly cwd: string;
      readonly host: string;
    }) => Effect.Effect<
      { readonly accountId: string; readonly viewer: string },
      GitHubPullRequestCliError
    >;
    readonly getViewerLogin: (input: {
      readonly cwd: string;
      readonly host: string;
    }) => Effect.Effect<string, GitHubPullRequestCliError>;

    readonly listPullRequests: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly state: PullRequestListState;
      readonly involvement: PullRequestInvolvement;
      readonly viewer: string;
      readonly limit: number;
      readonly query?: string | undefined;
      readonly cursor?: ProviderListCursor | undefined;
      readonly filters?: PullRequestListFilters | undefined;
    }) => Effect.Effect<GitHubPullRequestListBatch, GitHubPullRequestCliError>;

    readonly searchPullRequests: (input: {
      readonly cwd: string;
      readonly host: string;
      readonly repositories: ReadonlyArray<string>;
      readonly allRepositories?: boolean;
      readonly searchCursor?: string | undefined;
      readonly state: PullRequestListState;
      readonly involvement: PullRequestInvolvement;
      readonly viewer: string;
      readonly limit: number;
      readonly query?: string | undefined;
      readonly cursor?: ProviderListCursor | undefined;
      readonly filters?: PullRequestListFilters | undefined;
    }) => Effect.Effect<GitHubPullRequestSearchBatch, GitHubPullRequestCliError>;

    readonly listPullRequestStats: (input: {
      readonly cwd: string;
      readonly host: string;
      readonly changeRequests: ReadonlyArray<{
        readonly repository: string;
        readonly number: number;
      }>;
    }) => Effect.Effect<ReadonlyArray<GitHubPullRequestStat>, GitHubPullRequestCliError>;

    readonly getPullRequestSummary: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
    }) => Effect.Effect<ProviderChangeRequestSummary, GitHubPullRequestCliError>;

    readonly getPullRequestDetail: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
    }) => Effect.Effect<GitHubPullRequestCore, GitHubPullRequestCliError>;

    readonly getPullRequestPreview: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
    }) => Effect.Effect<
      Omit<PullRequestPreview, "projectId" | "repository">,
      GitHubPullRequestCliError
    >;

    readonly listWorkflowRunsRequiringApproval: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly headSha: string;
      readonly headBranch: string;
      readonly headRepositoryOwner: string;
      readonly isCrossRepository: true;
    }) => Effect.Effect<ReadonlyArray<GitHubWorkflowRunApproval>, GitHubPullRequestCliError>;

    readonly getPullRequestStack: (input: {
      readonly cwd: string;
      readonly includeDetails?: boolean;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
    }) => Effect.Effect<GitHubPullRequestStack | null, GitHubPullRequestCliError>;

    readonly getPullRequestBaseComparison: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly headRef: string;
      readonly allowReserve?: boolean | undefined;
    }) => Effect.Effect<GitHubBaseComparison, GitHubPullRequestCliError>;

    readonly getPullRequestActivity: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
    }) => Effect.Effect<GitHubPullRequestActivity, GitHubPullRequestCliError>;

    readonly getPullRequestDiff: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly cursor?: string | undefined;
      readonly commit?: string | undefined;
    }) => Effect.Effect<GitHubPullRequestDiffSlice, GitHubPullRequestCliError>;

    readonly getPullRequestDiffFileContents: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly commit?: string | undefined;
      readonly changeType: "change" | "rename-pure" | "rename-changed" | "new" | "deleted";
      readonly oldPath: string;
      readonly newPath: string;
    }) => Effect.Effect<
      { readonly oldContents: string; readonly newContents: string },
      GitHubPullRequestCliError
    >;

    readonly getPullRequestFilesViewed: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
    }) => Effect.Effect<GitHubPullRequestFilesViewed, GitHubPullRequestCliError>;

    readonly setPullRequestFilesViewed: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly files: ReadonlyArray<{ readonly path: string; readonly viewed: boolean }>;
    }) => Effect.Effect<void, GitHubPullRequestCliError>;

    readonly listReviewThreadComments: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
    }) => Effect.Effect<GitHubReviewThreadComments, GitHubPullRequestCliError>;

    readonly listActorAvatars: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly ids: ReadonlyArray<string>;
    }) => Effect.Effect<ReadonlyMap<string, string>, GitHubPullRequestCliError>;

    readonly getReviewThreadComments: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly threadId: string;
      readonly cursor: string;
    }) => Effect.Effect<PullRequestThreadCommentsResult, GitHubPullRequestCliError>;

    readonly getViewerAccess: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly allowReserve?: boolean | undefined;
    }) => Effect.Effect<GitHubViewerAccess & GitHubRepositoryAccess, GitHubPullRequestCliError>;

    readonly listReviewerCandidates: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
    }) => Effect.Effect<PullRequestReviewerCandidateList, GitHubPullRequestCliError>;

    readonly setReviewerRequest: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly reviewers: ReadonlyArray<{
        readonly id: string;
        readonly kind: PullRequestReviewerKind;
      }>;
      readonly requested: boolean;
    }) => Effect.Effect<void, GitHubPullRequestCliError>;

    readonly listLabelCandidates: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
    }) => Effect.Effect<PullRequestLabelCandidateList, GitHubPullRequestCliError>;

    readonly setLabels: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly labels: ReadonlyArray<string>;
      readonly applied: boolean;
    }) => Effect.Effect<void, GitHubPullRequestCliError>;

    readonly runPullRequestAction: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly action: PullRequestAction;
      readonly stackNumber?: number;
      readonly expectedStackHeads?: ReadonlyArray<PullRequestStackHead>;
      readonly mergeMethod?: PullRequestMergeMethod;
      readonly updateMethod?: PullRequestUpdateMethod;
    }) => Effect.Effect<void, GitHubPullRequestCliError>;

    readonly commentOnPullRequest: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly body: string;
    }) => Effect.Effect<void, GitHubPullRequestCliError>;

    readonly submitReview: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly verdict: PullRequestReviewVerdict;
      readonly body: string;
      readonly comments: ReadonlyArray<PullRequestReviewCommentDraft>;
    }) => Effect.Effect<void, GitHubPullRequestCliError>;

    readonly replyToReviewThread: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly threadId: string;
      readonly body: string;
    }) => Effect.Effect<void, GitHubPullRequestCliError>;

    readonly setReviewThreadResolution: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly threadId: string;
      readonly resolved: boolean;
    }) => Effect.Effect<void, GitHubPullRequestCliError>;

    readonly setReaction: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly subjectId?: string | undefined;
      readonly content: PullRequestReactionContent;
      readonly reacted: boolean;
    }) => Effect.Effect<void, GitHubPullRequestCliError>;

    readonly updatePullRequest: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly title?: string | undefined;
      readonly body?: string | undefined;
    }) => Effect.Effect<void, GitHubPullRequestCliError>;

    readonly updateComment: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly host: string;
      readonly number: number;
      readonly commentId: string;
      readonly kind: "issue-comment" | "review-comment";
      readonly body: string;
    }) => Effect.Effect<void, GitHubPullRequestCliError>;
  }
>()("t3/pullRequest/GitHubPullRequestCli") {}

function parseRepositorySelector(value: string): {
  readonly owner: string;
  readonly name: string;
} {
  const parts = value.trim().split("/").filter(Boolean);
  return { name: parts.at(-1) ?? "", owner: parts.at(-2) ?? "" };
}

function diffCursorPage(cursor: string): number | null {
  return /^[1-9][0-9]{0,6}$/.test(cursor) ? Number(cursor) : null;
}

function isCommitSha(value: string): boolean {
  return /^[0-9a-f]{7,64}$/i.test(value);
}

function searchPhrase(query: string): string {
  return `"${query.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

const REVIEW_QUALIFIERS = {
  approved: "approved",
  "changes-requested": "changes_requested",
  "review-required": "required",
  none: "none",
} as const;

function qualifierValue(value: string): string {
  return `"${value.replaceAll('"', "").trim()}"`;
}

function filterQualifiers(
  filters: PullRequestListFilters | undefined,
  viewer: string,
): ReadonlyArray<string> {
  if (filters === undefined) return [];
  return [
    ...(filters.labels ?? []).flatMap((group) =>
      group.length === 0 ? [] : [`label:${group.map(qualifierValue).join(",")}`],
    ),
    ...(filters.excludedLabels ?? []).map((label) => `-label:${qualifierValue(label)}`),
    ...(filters.author === undefined
      ? []
      : [`author:${qualifierValue(resolvePullRequestAuthorFilter(filters.author, viewer))}`]),
    ...(filters.draft === undefined ? [] : [`draft:${filters.draft === "only"}`]),
    ...(filters.review === undefined ? [] : [`review:${REVIEW_QUALIFIERS[filters.review]}`]),
    ...(filters.checks === undefined
      ? []
      : [`status:${filters.checks === "passing" ? "success" : "failure"}`]),
  ];
}

function matchesFilters(
  item: GitHubPullRequestListItem,
  filters: PullRequestListFilters | undefined,
  viewer: string,
): boolean {
  if (filters === undefined) return true;
  const labels = new Set(item.labels.map((label) => label.name.trim().toLowerCase()));
  const holds = (label: string) => labels.has(label.trim().toLowerCase());
  return (
    (filters.draft === undefined || item.isDraft === (filters.draft === "only")) &&
    (filters.review === undefined ||
      (filters.review === "none"
        ? item.reviewDecision === null
        : item.reviewDecision === filters.review)) &&
    (filters.checks === undefined || item.checksState === filters.checks) &&
    (filters.labels === undefined || filters.labels.every((group) => group.some(holds))) &&
    (filters.excludedLabels === undefined || !filters.excludedLabels.some(holds)) &&
    (filters.author === undefined ||
      item.author?.login.toLowerCase() ===
        resolvePullRequestAuthorFilter(filters.author, viewer).toLowerCase())
  );
}

function involvementArgs(input: {
  readonly state: PullRequestListState;
  readonly involvement: PullRequestInvolvement;
  readonly viewer: string;
  readonly query?: string | undefined;
  readonly cursor?: ProviderListCursor | undefined;
  readonly sorted: boolean;
  readonly filters?: PullRequestListFilters | undefined;
}): ReadonlyArray<string> {
  const query = input.query?.trim() ?? "";
  const searchTerms = !input.sorted
    ? []
    : [
        ...(input.involvement === "reviewing" ? [`review-requested:${input.viewer}`] : []),
        ...(input.state === "closed" ? ["is:unmerged"] : []),
        ...(query.length === 0 ? [] : [searchPhrase(query)]),
        ...(input.cursor === undefined ? [] : [`updated:<=${input.cursor.updatedBefore}`]),
        ...filterQualifiers(input.filters, input.viewer),
        "sort:updated-desc",
      ];
  return [
    ...(input.involvement === "authored" ? ["--author", input.viewer] : []),
    ...(searchTerms.length > 0 ? ["--search", searchTerms.join(" ")] : []),
  ];
}

function matchesUnsortedListing(
  item: GitHubPullRequestListItem,
  input: {
    readonly state: PullRequestListState;
    readonly involvement: PullRequestInvolvement;
    readonly viewer: string;
    readonly filters?: PullRequestListFilters | undefined;
  },
): boolean {
  const matchesState = input.state === "all" || item.state === input.state;
  const viewer = input.viewer.toLowerCase();
  const matchesInvolvement =
    input.involvement === "all" ||
    (input.involvement === "authored"
      ? item.author?.login.toLowerCase() === viewer
      : item.hasTeamReviewRequest ||
        item.reviewRequestLogins.some((login) => login.toLowerCase() === viewer));
  return matchesState && matchesInvolvement && matchesFilters(item, input.filters, input.viewer);
}

const SEARCH_REPOSITORY = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

function searchQuery(input: {
  readonly repositories: ReadonlyArray<string>;
  readonly allRepositories?: boolean;
  readonly state: PullRequestListState;
  readonly involvement: PullRequestInvolvement;
  readonly viewer: string;
  readonly query?: string | undefined;
  readonly cursor?: ProviderListCursor | undefined;
  readonly filters?: PullRequestListFilters | undefined;
}): string | null {
  if (input.repositories.length === 0 && !input.allRepositories) return null;
  if (input.allRepositories && input.involvement !== "authored") return null;
  const repositories = input.repositories.map((repository) => repository.trim());
  if (!repositories.every((repository) => SEARCH_REPOSITORY.test(repository))) return null;
  const query = input.query?.trim() ?? "";
  return [
    "is:pr",
    ...(input.state === "open" ? ["is:open"] : []),
    ...(input.state === "closed" ? ["is:closed", "is:unmerged"] : []),
    ...(input.state === "merged" ? ["is:merged"] : []),
    ...(input.involvement === "authored" ? [`author:${input.viewer}`] : []),
    ...(input.involvement === "reviewing" ? [`review-requested:${input.viewer}`] : []),
    ...(query.length === 0 ? [] : [searchPhrase(query)]),
    ...(input.cursor === undefined ? [] : [`updated:<=${input.cursor.updatedBefore}`]),
    ...filterQualifiers(input.filters, input.viewer),
    "sort:updated-desc",
    ...repositories.map((repository) => `repo:${repository}`),
  ].join(" ");
}

function cursorVariable(cursor: string | null): readonly [string, string] {
  return cursor === null ? ["-F", "cursor=null"] : ["-f", `cursor=${cursor}`];
}

function actionArgs(
  action: PullRequestAction,
  mergeMethod: PullRequestMergeMethod | undefined,
  updateMethod: PullRequestUpdateMethod | undefined,
): ReadonlyArray<string> {
  switch (action) {
    case "merge":
      return ["merge", `--${mergeMethod ?? "merge"}`];
    case "enable-auto-merge":
      return ["merge", "--auto", `--${mergeMethod ?? "merge"}`];
    case "disable-auto-merge":
      return ["merge", "--disable-auto"];
    case "update-branch":
      return ["update-branch", ...(updateMethod === "rebase" ? ["--rebase"] : [])];
    case "ready":
      return ["ready"];
    case "draft":
      return ["ready", "--undo"];
    case "close":
      return ["close"];
    case "reopen":
      return ["reopen"];
    case "revert":
      throw new Error("Revert requires a GraphQL mutation");
    case "approve-workflows":
      throw new Error("Workflow approval requires run discovery");
  }
}

/** @public */
export const make = Effect.gen(function* () {
  const github = yield* GitHubCli.GitHubCli;
  const graphQlBudget = yield* GitHubGraphQlBudget.GitHubGraphQlBudget;
  const routingIdentities = new Map<
    string,
    {
      at: number;
      value: { accountId: string; viewer: string };
    }
  >();
  const identityLocks = new Map<string, { gate: Semaphore.Semaphore; users: number }>();
  const decodeRoutingIdentity = Schema.decodeUnknownEffect(
    Schema.fromJsonString(
      Schema.Struct({
        id: PositiveInt,
        login: TrimmedNonEmptyString,
      }),
    ),
  );
  const captureVerifiedCredential = Effect.fn("GitHubPullRequestCli.captureVerifiedCredential")(
    function* (input: { readonly cwd: string; readonly host: string }) {
      const unavailable = () =>
        new GitHubViewerLoginUnavailableError({ command: "gh", cwd: input.cwd });
      const host = input.host.toLowerCase();
      const pinned = yield* GitHubCli.PinnedGitHubCredential;
      if (pinned !== null && pinned.host !== host) return yield* unavailable();
      const token =
        pinned !== null
          ? Redacted.value(pinned.token)
          : (yield* github
              .execute({
                cwd: input.cwd,
                args: ["auth", "token", "--hostname", host],
                env: { GH_DEBUG: "" },
              })
              .pipe(Effect.mapError(unavailable))).stdout.trim();
      if (!token) return yield* unavailable();
      const key = `${host}:${NodeCrypto.createHash("sha256").update(token).digest("hex")}`;
      const credential = { host, token: Redacted.make(token), credentialFingerprint: key };
      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          const lock = identityLocks.get(key) ?? { gate: Semaphore.makeUnsafe(1), users: 0 };
          lock.users++;
          identityLocks.set(key, lock);
          return lock;
        }),
        (lock) =>
          lock.gate.withPermit(
            Effect.gen(function* () {
              const now = yield* Clock.currentTimeMillis;
              const cached = routingIdentities.get(key);
              if (cached !== undefined && now - cached.at < 10 * 60_000)
                return { ...credential, ...cached.value };
              const response = yield* github
                .execute({
                  cwd: input.cwd,
                  args: ["api", "user", "--hostname", host],
                  env: {
                    GH_HOST: host,
                    GH_TOKEN: token,
                    GITHUB_TOKEN: token,
                    GH_ENTERPRISE_TOKEN: token,
                    GITHUB_ENTERPRISE_TOKEN: token,
                    GH_DEBUG: "",
                  },
                })
                .pipe(Effect.mapError(unavailable));
              const identity = yield* decodeRoutingIdentity(response.stdout).pipe(
                Effect.mapError(unavailable),
              );
              const value = { accountId: String(identity.id), viewer: identity.login };
              if (routingIdentities.size >= 128)
                routingIdentities.delete(routingIdentities.keys().next().value!);
              routingIdentities.set(key, { at: now, value });
              return { ...credential, ...value };
            }),
          ),
        (lock) =>
          Effect.sync(() => {
            lock.users--;
            if (lock.users === 0) identityLocks.delete(key);
          }),
      );
    },
  );
  const withVerifiedCredential: GitHubPullRequestCli["Service"]["withVerifiedCredential"] = (
    input,
    use,
  ) =>
    captureVerifiedCredential(input).pipe(
      Effect.flatMap(({ host, token, accountId, viewer, credentialFingerprint }) =>
        use({ accountId, viewer, credentialFingerprint }).pipe(
          Effect.provideService(SourceControlRateLimit.CredentialScope, credentialFingerprint),
          Effect.provideService(GitHubCli.PinnedGitHubCredential, {
            host,
            token,
            credentialFingerprint,
          }),
        ),
      ),
    );
  const getRoutingIdentity: GitHubPullRequestCli["Service"]["getRoutingIdentity"] = (input) =>
    captureVerifiedCredential(input).pipe(
      Effect.map(({ accountId, viewer }) => ({ accountId, viewer })),
    );

  const nodeIds = new Map<string, string>();

  const pullRequestNodeId = (input: {
    readonly cwd: string;
    readonly repository: string;
    readonly host: string;
    readonly number: number;
    readonly operation: string;
  }): Effect.Effect<string, GitHubPullRequestCliError> => {
    const { owner, name } = parseRepositorySelector(input.repository);
    const key = `${input.host} ${owner}/${name} ${input.number}`;
    const held = nodeIds.get(key);
    if (held !== undefined) {
      nodeIds.delete(key);
      nodeIds.set(key, held);
      return Effect.succeed(held);
    }
    return graphqlRead({
      cwd: input.cwd,
      host: input.host,
      operation: input.operation,
      allowReserve: true,
      variables: [
        ["-f", `owner=${owner}`],
        ["-f", `name=${name}`],
        ["-F", `number=${input.number}`],
      ],
      query: PULL_REQUEST_NODE_ID_GRAPHQL_QUERY,
      decode: decodePullRequestNodeIdJson,
    }).pipe(
      Effect.tap((nodeId) =>
        Effect.sync(() => {
          if (nodeIds.size >= NODE_ID_CACHE_CAPACITY) {
            const oldest = nodeIds.keys().next().value;
            if (oldest !== undefined) nodeIds.delete(oldest);
          }
          nodeIds.set(key, nodeId);
        }),
      ),
    );
  };

  const subjectBelongsToPullRequest = (input: {
    readonly cwd: string;
    readonly repository: string;
    readonly host: string;
    readonly number: number;
    readonly subjectId: string;
    readonly operation: string;
  }) => {
    const { owner, name } = parseRepositorySelector(input.repository);
    return graphqlRead({
      cwd: input.cwd,
      host: input.host,
      operation: input.operation,
      allowReserve: true,
      variables: [
        ["-f", `owner=${owner}`],
        ["-f", `name=${name}`],
        ["-F", `number=${input.number}`],
        ["-f", `subjectId=${input.subjectId}`],
      ],
      query: REACTION_SUBJECT_PULL_REQUEST_GRAPHQL_QUERY,
      decode: decodeReactionSubjectScopeJson,
    });
  };

  const repositoryArgs = (input: { readonly host: string; readonly repository: string }) => [
    "--repo",
    `${input.host}/${input.repository}`,
  ];

  const graphql = (input: {
    readonly cwd: string;
    readonly host: string;
    readonly query: string;
    readonly variables: Readonly<Record<string, string>>;
  }) =>
    github
      .execute({
        cwd: input.cwd,
        args: ["api", "graphql", "--hostname", input.host, "--input", "-"],
        stdin: encodeGraphQlRequestJson({ query: input.query, variables: input.variables }),
      })
      .pipe(Effect.asVoid);

  const graphqlRead = <A>(input: {
    readonly cwd: string;
    readonly host: string;
    readonly operation: string;
    readonly allowReserve?: boolean | undefined;
    readonly variables?: ReadonlyArray<readonly [string, string]>;
    readonly privateVariables?: Readonly<Record<string, string>>;
    readonly query: string;
    readonly decode: (raw: string) => Result.Result<A, unknown>;
  }): Effect.Effect<A, GitHubPullRequestCliError> => {
    return graphQlBudget
      .query(
        input.host,
        input.query,
        input.allowReserve === true ? { allowReserve: true } : undefined,
      )
      .pipe(
        Effect.flatMap((query) =>
          github.execute(
            input.privateVariables === undefined
              ? {
                  cwd: input.cwd,
                  args: [
                    "api",
                    "graphql",
                    "--hostname",
                    input.host,
                    ...(input.variables ?? []).flat(),
                    "-f",
                    `query=${query}`,
                  ],
                }
              : {
                  cwd: input.cwd,
                  args: ["api", "graphql", "--hostname", input.host, "--input", "-"],
                  stdin: encodeGraphQlRequestJson({
                    query,
                    variables: input.privateVariables,
                  }),
                },
          ),
        ),
        Effect.tap((result) => graphQlBudget.observe(input.host, result.stdout)),
        Effect.flatMap((result) => {
          const decoded = input.decode(result.stdout.trim());
          return Result.isSuccess(decoded)
            ? Effect.succeed(decoded.success)
            : Effect.fail(
                new GitHubPullRequestReadError({
                  command: "gh",
                  cwd: input.cwd,
                  operation: input.operation,
                  cause: decoded.failure,
                }),
              );
        }),
      );
  };

  const diffFilesPage = (input: {
    readonly cwd: string;
    readonly repository: string;
    readonly host: string;
    readonly number: number;
    readonly page: number;
    readonly commit?: string | undefined;
  }): Effect.Effect<GitHubPullRequestDiffSlice, GitHubPullRequestCliError> => {
    const { owner, name } = parseRepositorySelector(input.repository);
    const paging = `per_page=${DIFF_FILES_PAGE_SIZE}&page=${input.page}`;
    return github
      .execute({
        cwd: input.cwd,
        args: [
          "api",
          "--hostname",
          input.host,
          input.commit === undefined
            ? `repos/${owner}/${name}/pulls/${input.number}/files?${paging}`
            : `repos/${owner}/${name}/commits/${input.commit}?${paging}`,
          ...(input.commit === undefined ? [] : ["--jq", ".files // []"]),
        ],
        maxOutputBytes: DIFF_MAX_OUTPUT_BYTES,
        timeoutMs: DIFF_TIMEOUT_MS,
      })
      .pipe(
        Effect.flatMap((result) => {
          if (result.stdoutTruncated) {
            return Effect.fail(
              new GitHubPullRequestReadError({
                command: "gh",
                cwd: input.cwd,
                operation: "getPullRequestDiff",
                cause: new Error(`Page ${input.page} of the changed files was too large to read.`),
              }),
            );
          }
          const decoded = decodePullRequestFilesJson(result.stdout.trim());
          if (!Result.isSuccess(decoded)) {
            return Effect.fail(
              new GitHubPullRequestReadError({
                command: "gh",
                cwd: input.cwd,
                operation: "getPullRequestDiff",
                cause: decoded.failure,
              }),
            );
          }
          const morePages = decoded.success.rawCount >= DIFF_FILES_PAGE_SIZE;
          return Effect.succeed({
            patch: decoded.success.patch,
            truncated: decoded.success.truncated,
            nextCursor: morePages ? String(input.page + 1) : null,
            ...(decoded.success.omittedFileStats.length === 0
              ? {}
              : { omittedFileStats: decoded.success.omittedFileStats }),
          });
        }),
      );
  };

  const getPullRequestDiffFileContents: GitHubPullRequestCli["Service"]["getPullRequestDiffFileContents"] =
    (input) =>
      Effect.gen(function* () {
        if (input.commit !== undefined && !isCommitSha(input.commit)) {
          return yield* new GitHubDiffCommitError({ command: "gh", cwd: input.cwd });
        }
        const { owner, name } = parseRepositorySelector(input.repository);
        const refsResult = yield* github.execute({
          cwd: input.cwd,
          args: [
            "api",
            "--hostname",
            input.host,
            input.commit === undefined
              ? `repos/${owner}/${name}/pulls/${input.number}`
              : `repos/${owner}/${name}/commits/${input.commit}`,
            "--jq",
            input.commit === undefined
              ? "[.base.sha, .head.sha] | @tsv"
              : "[.parents[0].sha, .sha] | @tsv",
          ],
          maxOutputBytes: 1024,
          timeoutMs: DIFF_TIMEOUT_MS,
        });
        const [baseRef, headRef, ...extraRefs] = refsResult.stdout.trimEnd().split("\t");
        const rootCommitNewFile =
          input.commit !== undefined && input.changeType === "new" && baseRef === "";
        if (
          refsResult.stdoutTruncated ||
          !headRef ||
          extraRefs.length > 0 ||
          (!rootCommitNewFile && (baseRef === undefined || !isCommitSha(baseRef))) ||
          !isCommitSha(headRef)
        ) {
          return yield* new GitHubDiffRevisionsUnavailableError({
            command: "gh",
            cwd: input.cwd,
            number: input.number,
            ...(input.commit === undefined ? {} : { commit: input.commit }),
          });
        }

        const readFile = (revision: string, filePath: string) =>
          github
            .execute({
              cwd: input.cwd,
              args: [
                "api",
                "--hostname",
                input.host,
                "--header",
                "Accept: application/vnd.github.raw+json",
                `repos/${owner}/${name}/contents/${filePath
                  .split("/")
                  .map(encodeURIComponent)
                  .join("/")}?ref=${encodeURIComponent(revision)}`,
              ],
              maxOutputBytes: DIFF_FILE_MAX_OUTPUT_BYTES,
              timeoutMs: DIFF_TIMEOUT_MS,
            })
            .pipe(
              Effect.flatMap((result) =>
                result.stdoutTruncated ||
                result.stdout.includes("\0") ||
                result.stdoutInvalidUtf8 === true
                  ? Effect.fail(
                      new GitHubDiffFileContentsUnavailableError({
                        command: "gh",
                        cwd: input.cwd,
                        path: filePath,
                        reason: result.stdoutTruncated ? "oversized" : "binary",
                      }),
                    )
                  : Effect.succeed(result.stdout),
              ),
            );

        const [oldContents, newContents] = yield* Effect.all(
          [
            input.changeType === "new" ? Effect.succeed("") : readFile(baseRef, input.oldPath),
            input.changeType === "deleted" ? Effect.succeed("") : readFile(headRef, input.newPath),
          ],
          { concurrency: 2 },
        );
        return { oldContents, newContents };
      });

  const readLegacyDetail = (
    input: Parameters<GitHubPullRequestCli["Service"]["getPullRequestDetail"]>[0],
  ) =>
    github
      .execute({
        cwd: input.cwd,
        args: [
          "pr",
          "view",
          String(input.number),
          ...repositoryArgs(input),
          "--json",
          PULL_REQUEST_DETAIL_JSON_FIELDS,
        ],
      })
      .pipe(
        Effect.flatMap((result) => {
          const decoded = decodePullRequestDetailJson(result.stdout.trim());
          return Result.isSuccess(decoded)
            ? Effect.succeed(decoded.success)
            : Effect.fail(
                new GitHubPullRequestReadError({
                  command: "gh",
                  cwd: input.cwd,
                  operation: "getPullRequestDetail",
                  cause: decoded.failure,
                }),
              );
        }),
      );

  const getPullRequestDetail: GitHubPullRequestCli["Service"]["getPullRequestDetail"] = (input) => {
    const { owner, name } = parseRepositorySelector(input.repository);
    return GitHubCli.AllowGitHubReserve.pipe(
      Effect.flatMap((allowReserve) =>
        graphqlRead({
          allowReserve,
          cwd: input.cwd,
          host: input.host,
          operation: "getPullRequestDetail",
          variables: [
            ["-f", `owner=${owner}`],
            ["-f", `name=${name}`],
            ["-F", `number=${input.number}`],
            ["-f", `headRef=refs/pull/${input.number}/head`],
          ],
          query: PULL_REQUEST_CORE_GRAPHQL_QUERY,
          decode: decodePullRequestCoreJson,
        }),
      ),
      Effect.filterOrElse(
        (core) => !core.checksTruncated,
        (core) =>
          readLegacyDetail(input).pipe(
            Effect.filterOrFail(
              (detail) => detail.headSha === core.headSha,
              () =>
                new GitHubPullRequestReadError({
                  command: "gh",
                  cwd: input.cwd,
                  operation: "getPullRequestDetail",
                  cause: new Error("Pull request head changed while reading checks."),
                }),
            ),
            Effect.map((detail) => ({
              ...core,
              checks: detail.checks,
              checksState: detail.checksState,
              checksTruncated: false,
            })),
          ),
      ),
    );
  };

  const workflowApprovalLimit = 1_000;
  const workflowApprovalProbeLimit = String(workflowApprovalLimit + 1);
  const workflowApprovalReadError = (cwd: string, cause: unknown) =>
    new GitHubPullRequestReadError({
      command: "gh",
      cwd,
      operation: "listWorkflowRunsRequiringApproval",
      cause,
    });
  const listWorkflowRunsRequiringApproval: GitHubPullRequestCli["Service"]["listWorkflowRunsRequiringApproval"] =
    (input) =>
      Effect.all(
        [
          github
            .execute({
              cwd: input.cwd,
              args: [
                "pr",
                "list",
                ...repositoryArgs(input),
                "--state",
                "open",
                "--head",
                input.headBranch,
                "--limit",
                workflowApprovalProbeLimit,
                "--json",
                "number,headRefOid,isCrossRepository,headRepositoryOwner",
              ],
            })
            .pipe(
              Effect.flatMap(
                (
                  result,
                ): Effect.Effect<
                  GitHubPullRequestHead,
                  GitHubPullRequestReadError | GitHubWorkflowApprovalRefusedError
                > => {
                  const decoded = decodePullRequestHeadsJson(result.stdout.trim());
                  if (!Result.isSuccess(decoded)) {
                    return Effect.fail(workflowApprovalReadError(input.cwd, decoded.failure));
                  }
                  const exactHeads = decoded.success.filter(
                    (pullRequest) =>
                      pullRequest.headSha === input.headSha &&
                      pullRequest.isCrossRepository === true &&
                      pullRequest.headRepositoryOwner?.toLowerCase() ===
                        input.headRepositoryOwner.toLowerCase(),
                  );
                  if (decoded.success.length > workflowApprovalLimit) {
                    return Effect.fail(
                      new GitHubWorkflowApprovalRefusedError({
                        command: "gh",
                        cwd: input.cwd,
                        number: input.number,
                        reason: "head-list-truncated",
                        observedCount: decoded.success.length,
                        limit: workflowApprovalLimit,
                      }),
                    );
                  }
                  if (exactHeads.length !== 1 || exactHeads[0]?.number !== input.number) {
                    return Effect.fail(
                      new GitHubWorkflowApprovalRefusedError({
                        command: "gh",
                        cwd: input.cwd,
                        number: input.number,
                        reason: "head-not-unique",
                        observedCount: exactHeads.length,
                        limit: workflowApprovalLimit,
                      }),
                    );
                  }
                  return Effect.succeed(exactHeads[0]);
                },
              ),
            ),
          github
            .execute({
              cwd: input.cwd,
              args: [
                "run",
                "list",
                ...repositoryArgs(input),
                "--commit",
                input.headSha,
                "--branch",
                input.headBranch,
                "--event",
                "pull_request",
                "--status",
                "action_required",
                "--limit",
                workflowApprovalProbeLimit,
                "--json",
                "databaseId,workflowName,url",
              ],
            })
            .pipe(
              Effect.flatMap(
                (
                  result,
                ): Effect.Effect<
                  ReadonlyArray<GitHubWorkflowRunApproval>,
                  GitHubPullRequestReadError | GitHubWorkflowApprovalRefusedError
                > => {
                  const decoded = decodeWorkflowRunApprovalsJson(result.stdout.trim());
                  if (!Result.isSuccess(decoded)) {
                    return Effect.fail(workflowApprovalReadError(input.cwd, decoded.failure));
                  }
                  return decoded.success.length > workflowApprovalLimit
                    ? Effect.fail(
                        new GitHubWorkflowApprovalRefusedError({
                          command: "gh",
                          cwd: input.cwd,
                          number: input.number,
                          reason: "run-list-truncated",
                          observedCount: decoded.success.length,
                          limit: workflowApprovalLimit,
                        }),
                      )
                    : Effect.succeed(decoded.success);
                },
              ),
            ),
        ],
        { concurrency: 2 },
      ).pipe(Effect.map(([, runs]) => runs));

  const viewPullRequestSummary = (input: PullRequestSummaryRead) =>
    github
      .execute({
        cwd: input.cwd,
        args: [
          "pr",
          "view",
          String(input.number),
          ...repositoryArgs(input),
          "--json",
          PULL_REQUEST_DETAIL_JSON_FIELDS,
        ],
      })
      .pipe(
        Effect.flatMap((result) => {
          const decoded = decodePullRequestDetailJson(result.stdout.trim());
          if (!Result.isSuccess(decoded)) {
            return Effect.fail(
              new GitHubPullRequestReadError({
                command: "gh",
                cwd: input.cwd,
                operation: "getPullRequestSummary",
                cause: decoded.failure,
              }),
            );
          }
          const detail = decoded.success;
          return Effect.succeed({
            number: detail.number,
            title: detail.title,
            url: detail.url,
            headBranch: detail.headBranch,
            baseBranch: detail.baseBranch,
            state: detail.state,
            updatedAt: detail.updatedAt,
            closedAt: detail.closedAt ?? null,
            mergedAt: detail.mergedAt ?? null,
            isDraft: detail.isDraft,
            author: detail.author,
            additions: detail.additions,
            deletions: detail.deletions,
            changedFiles: detail.changedFiles,
            reviewDecision: detail.reviewDecision,
            checksState: detail.checksState,
            mergeability: detail.mergeability,
          });
        }),
      );

  const summaryResolver = RequestResolver.makeGrouped<PullRequestSummaryRead, string>({
    key: ({ request, context }) =>
      JSON.stringify([
        request.host.toLowerCase(),
        Context.getOrElse(context, GitHubCli.PinnedGitHubCredential, () => null)
          ?.credentialFingerprint ?? null,
        Context.getOrElse(context, SourceControlRateLimit.CredentialScope, () => ""),
      ]),
    resolver: (entries) => {
      const [first] = entries;
      const batchable = entries.filter(
        (entry) => buildPullRequestSummariesGraphQlQuery([entry.request]) !== null,
      );
      const query = buildPullRequestSummariesGraphQlQuery(batchable.map((entry) => entry.request));
      const batched =
        query === null
          ? Effect.succeed(new Map<number, GitHubPullRequestSummary>())
          : graphqlRead({
              cwd: first.request.cwd,
              host: first.request.host,
              operation: "getPullRequestSummary",
              query,
              decode: decodePullRequestSummariesJson,
            });
      return batched.pipe(
        Effect.catchCauseIf(
          (cause) =>
            !Cause.hasInterruptsOnly(cause) &&
            !Cause.findErrorOption(cause).pipe(
              Option.exists((error) => error._tag === "SourceControlRateLimitPausedError"),
            ),
          (cause) =>
            Effect.logDebug("batched pull request summary read failed", { cause }).pipe(
              Effect.as(new Map<number, GitHubPullRequestSummary>()),
            ),
        ),
        Effect.flatMap((summaries) => {
          const unanswered = entries.filter((entry) => {
            const summary = summaries.get(batchable.indexOf(entry));
            if (summary === undefined) return true;
            entry.completeUnsafe(Exit.succeed(summary));
            return false;
          });
          return Effect.forEach(
            unanswered,
            (entry) =>
              viewPullRequestSummary(entry.request).pipe(
                Effect.exit,
                Effect.map((exit) => entry.completeUnsafe(exit)),
              ),
            { concurrency: STAT_REQUEST_CONCURRENCY, discard: true },
          );
        }),
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            for (const entry of entries) entry.completeUnsafe(Exit.failCause(cause));
          }),
        ),
      );
    },
  }).pipe(
    RequestResolver.setDelay(SUMMARY_BATCH_WINDOW),
    RequestResolver.batchN(STAT_ALIASES_PER_REQUEST),
  );
  const getPullRequestSummary: GitHubPullRequestCli["Service"]["getPullRequestSummary"] = (input) =>
    Effect.request(new PullRequestSummaryRead(input), summaryResolver);

  return GitHubPullRequestCli.of({
    withVerifiedCredential,
    getRoutingIdentity,
    getViewerLogin: (input) =>
      getRoutingIdentity(input).pipe(Effect.map((identity) => identity.viewer)),

    listPullRequests: (input) => {
      const fallbackMaxRows = Math.max(input.limit + 1, PULL_REQUEST_FALLBACK_MAX_ROWS);
      const read = (
        continues: boolean,
        requestedRows = input.limit + 1,
      ): Effect.Effect<GitHubPullRequestListBatch, GitHubPullRequestCliError> =>
        github
          .execute({
            cwd: input.cwd,
            args: [
              "pr",
              "list",
              ...repositoryArgs(input),
              ...involvementArgs({ ...input, sorted: continues }),
              "--state",
              input.state,
              "--limit",
              String(requestedRows),
              "--json",
              PULL_REQUEST_LIST_JSON_FIELDS,
            ],
          })
          .pipe(
            Effect.flatMap((result) => {
              const raw = result.stdout.trim();
              if (raw.length === 0) {
                return Effect.succeed({ items: [], truncated: false, continues });
              }
              const decoded = decodePullRequestListJson(raw);
              if (Result.isSuccess(decoded)) {
                const items = continues
                  ? decoded.success.items
                  : decoded.success.items.filter((item) => matchesUnsortedListing(item, input));
                if (
                  !continues &&
                  items.length < input.limit &&
                  decoded.success.rawCount >= requestedRows &&
                  requestedRows < fallbackMaxRows
                ) {
                  const nextRows = Math.min(requestedRows * 2, fallbackMaxRows);
                  if (nextRows > requestedRows) return read(false, nextRows);
                }
                return Effect.succeed({
                  items: items.slice(0, input.limit),
                  truncated: continues
                    ? decoded.success.rawCount > input.limit
                    : items.length > input.limit || decoded.success.rawCount >= requestedRows,
                  continues,
                });
              }
              return Effect.fail(
                new GitHubPullRequestReadError({
                  command: "gh",
                  cwd: input.cwd,
                  operation: "listPullRequests",
                  cause: decoded.failure,
                }),
              );
            }),
          );
      const hasQuery = (input.query?.trim().length ?? 0) > 0;
      return read(true).pipe(
        Effect.filterOrElse(
          (batch) => batch.items.length > 0 || input.cursor !== undefined || hasQuery,
          () => read(false),
        ),
        Effect.flatMap((batch) => {
          if (input.host !== "github.com" || batch.items.length === 0) return Effect.succeed(batch);
          const chunks: Array<ReadonlyArray<GitHubPullRequestListItem>> = [];
          for (let start = 0; start < batch.items.length; start += STAT_ALIASES_PER_REQUEST) {
            chunks.push(batch.items.slice(start, start + STAT_ALIASES_PER_REQUEST));
          }
          return Effect.forEach(
            chunks,
            (chunk) => {
              const query = buildPullRequestStackMembershipsGraphQlQuery(
                input.repository,
                chunk.map((item) => item.number),
              );
              if (query === null) return Effect.succeed(chunk);
              return graphqlRead({
                cwd: input.cwd,
                host: input.host,
                operation: "listPullRequestStackMemberships",
                query,
                decode: decodePullRequestStackMembershipsJson,
              }).pipe(
                Effect.map((memberships) =>
                  chunk.map((item, index) => {
                    const stack = memberships.get(index);
                    return stack === undefined ? item : { ...item, stack };
                  }),
                ),
                Effect.catch(() =>
                  Effect.logWarning("Pull request stack membership enrichment failed", {
                    operation: "listPullRequestStackMemberships",
                    host: input.host,
                    rows: chunk.length,
                  }).pipe(Effect.as(chunk)),
                ),
              );
            },
            { concurrency: STAT_REQUEST_CONCURRENCY },
          ).pipe(Effect.map((chunks) => ({ ...batch, items: chunks.flat() })));
        }),
      );
    },

    searchPullRequests: (input) => {
      const query = searchQuery(input);
      if (query === null) {
        return Effect.fail(
          new GitHubRepositorySelectorError({
            command: "gh",
            cwd: input.cwd,
            operation: "searchPullRequests",
          }),
        );
      }
      const rows = Math.min(
        input.limit + (input.allRepositories ? 0 : 1),
        PULL_REQUEST_SEARCH_MAX_ROWS,
      );
      return graphqlRead({
        cwd: input.cwd,
        host: input.host,
        operation: "searchPullRequests",
        privateVariables: {
          q: query,
          ...(input.searchCursor === undefined ? {} : { cursor: input.searchCursor }),
        },
        query: pullRequestSearchGraphQlQuery(rows, input.host === "github.com"),
        decode: decodePullRequestSearchJson,
      }).pipe(
        Effect.map((batch) => ({
          items: batch.items.slice(0, input.limit),
          truncated: batch.rawCount > input.limit || batch.hasNextPage,
          nextCursor: batch.nextCursor,
        })),
      );
    },

    listPullRequestStats: (input) => {
      const chunks: Array<ReadonlyArray<{ readonly repository: string; readonly number: number }>> =
        [];
      for (let start = 0; start < input.changeRequests.length; start += STAT_ALIASES_PER_REQUEST) {
        chunks.push(input.changeRequests.slice(start, start + STAT_ALIASES_PER_REQUEST));
      }
      return Effect.forEach(
        chunks,
        (chunk) => {
          const query = buildPullRequestStatsGraphQlQuery(chunk);
          if (query === null) {
            return Effect.fail(
              new GitHubRepositorySelectorError({
                command: "gh",
                cwd: input.cwd,
                operation: "listPullRequestStats",
              }),
            );
          }
          return graphqlRead({
            cwd: input.cwd,
            host: input.host,
            operation: "listPullRequestStats",
            query,
            decode: decodePullRequestStatsJson,
          }).pipe(
            Effect.map((stats) =>
              chunk.flatMap((changeRequest, index) => {
                const stat = stats.get(index);
                return stat === undefined ? [] : [{ ...changeRequest, ...stat }];
              }),
            ),
          );
        },
        { concurrency: STAT_REQUEST_CONCURRENCY },
      ).pipe(Effect.map((results) => results.flat()));
    },

    getPullRequestSummary,

    getPullRequestDetail,
    getPullRequestPreview: (input) => {
      const { owner, name } = parseRepositorySelector(input.repository);
      return graphqlRead({
        cwd: input.cwd,
        host: input.host,
        operation: "getPullRequestPreview",
        variables: [
          ["-f", `owner=${owner}`],
          ["-f", `name=${name}`],
          ["-F", `number=${input.number}`],
        ],
        query: PULL_REQUEST_PREVIEW_GRAPHQL_QUERY,
        decode: decodePullRequestPreviewJson,
      });
    },
    listWorkflowRunsRequiringApproval,

    getPullRequestStack: (input) => {
      const { owner, name } = parseRepositorySelector(input.repository);
      return github
        .execute({
          cwd: input.cwd,
          args: [
            "api",
            "--hostname",
            input.host,
            `repos/${owner}/${name}/stacks?pull_request=${input.number}`,
          ],
        })
        .pipe(
          Effect.flatMap((result) => {
            const decoded = decodePullRequestStacksJson(result.stdout.trim());
            return Result.isSuccess(decoded)
              ? Effect.succeed(decoded.success)
              : Effect.fail(
                  new GitHubPullRequestReadError({
                    command: "gh",
                    cwd: input.cwd,
                    operation: "getPullRequestStack",
                    cause: decoded.failure,
                  }),
                );
          }),
          // @effect-diagnostics-next-line flatMapConditionalToFilterOrFail:off - the fallback needs a non-null stack, which a predicate that also reads includeDetails cannot refine.
          Effect.flatMap((stack) => {
            if (!input.includeDetails || stack === null) return Effect.succeed(stack);
            return github
              .execute({
                cwd: input.cwd,
                args: [
                  "api",
                  "--hostname",
                  input.host,
                  `repos/${owner}/${name}/stacks/${stack.number}`,
                ],
              })
              .pipe(
                Effect.flatMap((result) => {
                  const decoded = decodePullRequestStacksJson(`[${result.stdout.trim()}]`);
                  return Result.isSuccess(decoded)
                    ? Effect.succeed(decoded.success)
                    : Effect.fail(
                        new GitHubPullRequestReadError({
                          command: "gh",
                          cwd: input.cwd,
                          operation: "getPullRequestStack",
                          cause: decoded.failure,
                        }),
                      );
                }),
              );
          }),
          Effect.catchTags({
            GitHubPullRequestNotFoundError: () => Effect.succeed(null),
          }),
        );
    },

    getPullRequestBaseComparison: (input) => {
      const { owner, name } = parseRepositorySelector(input.repository);
      return graphqlRead({
        cwd: input.cwd,
        host: input.host,
        operation: "getPullRequestBaseComparison",
        ...(input.allowReserve === true ? { allowReserve: true } : {}),
        variables: [
          ["-f", `owner=${owner}`],
          ["-f", `name=${name}`],
          ["-F", `number=${input.number}`],
          ["-f", `headRef=${input.headRef}`],
        ],
        query: BASE_COMPARISON_GRAPHQL_QUERY,
        decode: decodeBaseComparisonJson,
      });
    },

    getPullRequestActivity: (input) =>
      github
        .execute({
          cwd: input.cwd,
          args: [
            "pr",
            "view",
            String(input.number),
            ...repositoryArgs(input),
            "--json",
            PULL_REQUEST_ACTIVITY_JSON_FIELDS,
          ],
        })
        .pipe(
          Effect.flatMap((result) => {
            const decoded = decodePullRequestActivityJson(result.stdout.trim());
            return Result.isSuccess(decoded)
              ? Effect.succeed(decoded.success)
              : Effect.fail(
                  new GitHubPullRequestReadError({
                    command: "gh",
                    cwd: input.cwd,
                    operation: "getPullRequestActivity",
                    cause: decoded.failure,
                  }),
                );
          }),
        ),

    getPullRequestDiff: (input) => {
      const filesPage = (page: number) =>
        diffFilesPage({
          cwd: input.cwd,
          repository: input.repository,
          host: input.host,
          number: input.number,
          page,
          ...(input.commit === undefined ? {} : { commit: input.commit }),
        });
      if (input.commit !== undefined && !isCommitSha(input.commit)) {
        return Effect.fail(new GitHubDiffCommitError({ command: "gh", cwd: input.cwd }));
      }
      if (input.cursor !== undefined) {
        const page = diffCursorPage(input.cursor);
        return page === null
          ? Effect.fail(new GitHubDiffCursorError({ command: "gh", cwd: input.cwd }))
          : filesPage(page);
      }
      if (input.commit !== undefined) {
        return filesPage(1);
      }
      return github
        .execute({
          cwd: input.cwd,
          args: ["pr", "diff", String(input.number), ...repositoryArgs(input), "--color", "never"],
          maxOutputBytes: DIFF_MAX_OUTPUT_BYTES,
          timeoutMs: DIFF_TIMEOUT_MS,
        })
        .pipe(
          Effect.flatMap((result) =>
            result.stdoutTruncated
              ? filesPage(1)
              : Effect.succeed({ patch: result.stdout, truncated: false, nextCursor: null }),
          ),
          Effect.catchTags({
            GitHubCliCommandError: (error) => filesPage(1).pipe(Effect.mapError(() => error)),
          }),
        );
    },

    getPullRequestDiffFileContents,

    getReviewThreadComments: (input) => {
      const { owner, name } = parseRepositorySelector(input.repository);
      return graphqlRead({
        cwd: input.cwd,
        host: input.host,
        operation: "getReviewThreadComments",
        variables: [
          ["-f", `owner=${owner}`],
          ["-f", `name=${name}`],
          ["-F", `number=${input.number}`],
          ["-f", `threadId=${input.threadId}`],
          cursorVariable(input.cursor),
        ],
        query: REVIEW_THREAD_COMMENTS_GRAPHQL_QUERY,
        decode: decodeReviewThreadCommentsJson,
      }).pipe(
        Effect.flatMap(({ belongsToPullRequest, comments, nextCursor }) =>
          belongsToPullRequest
            ? Effect.succeed({ comments, nextCursor })
            : Effect.fail(
                new GitHubSubjectScopeError({
                  command: "gh",
                  cwd: input.cwd,
                  operation: "getReviewThreadComments",
                }),
              ),
        ),
      );
    },

    listReviewThreadComments: (input) =>
      Effect.gen(function* () {
        const { owner, name } = parseRepositorySelector(input.repository);
        const threadPage = (
          cursor: string | null,
        ): Effect.Effect<GitHubReviewThreadPage, GitHubPullRequestCliError> =>
          graphqlRead({
            cwd: input.cwd,
            host: input.host,
            operation: "listReviewThreadComments",
            variables: [
              ["-f", `owner=${owner}`],
              ["-f", `name=${name}`],
              ["-F", `number=${input.number}`],
              cursorVariable(cursor),
            ],
            query: REVIEW_THREADS_GRAPHQL_QUERY,
            decode: decodeReviewThreadsJson,
          });
        const entries: GitHubReviewThreadEntry[] = [];
        const avatarsByLogin = new Map<string, string>();
        const botLogins = new Set<string>();
        const commitStats = new Map<
          string,
          { readonly additions: number; readonly deletions: number }
        >();
        let reviewers: ReadonlyArray<PullRequestActor> = [];
        let reactions: GitHubReviewThreadPage["reactions"] = [];
        const reactionsById = new Map<string, ReadonlyArray<PullRequestReaction>>();
        let commits: GitHubReviewThreadPage["commits"] = [];
        let viewer: GitHubReviewThreadPage["viewer"] = { canUpdate: true, didAuthor: false };
        const dismissalsByReviewId = new Map<string, string>();
        let dismissalCursor: string | null = null;
        let cursor: string | null = null;
        let page = 0;
        do {
          const read: GitHubReviewThreadPage = yield* threadPage(cursor);
          entries.push(...read.threads);
          for (const login of read.botLogins) botLogins.add(login);
          for (const [login, avatarUrl] of read.avatarsByLogin)
            avatarsByLogin.set(login, avatarUrl);
          if (page === 0) {
            reviewers = read.reviewers;
            reactions = read.reactions;
            for (const [id, entry] of read.reactionsById) reactionsById.set(id, entry);
            commits = read.commits;
            viewer = read.viewer;
            for (const [id, message] of read.dismissalsByReviewId)
              dismissalsByReviewId.set(id, message);
            dismissalCursor = read.nextDismissalCursor;
            for (const [oid, stat] of read.commitStats) commitStats.set(oid, stat);
          }
          cursor = read.nextCursor;
          page += 1;
        } while (cursor !== null && page < REVIEW_THREAD_PAGES);

        let dismissalPage = 0;
        while (dismissalCursor !== null && dismissalPage < REVIEW_THREAD_PAGES) {
          const read: {
            readonly dismissalsByReviewId: ReadonlyMap<string, string>;
            readonly nextCursor: string | null;
          } = yield* graphqlRead({
            cwd: input.cwd,
            host: input.host,
            operation: "listReviewThreadComments",
            variables: [
              ["-f", `owner=${owner}`],
              ["-f", `name=${name}`],
              ["-F", `number=${input.number}`],
              ["-f", `cursor=${dismissalCursor}`],
            ],
            query: REVIEW_DISMISSALS_GRAPHQL_QUERY,
            decode: decodeReviewDismissalsJson,
          });
          for (const [id, message] of read.dismissalsByReviewId)
            dismissalsByReviewId.set(id, message);
          dismissalCursor = read.nextCursor;
          dismissalPage += 1;
        }

        const reviewThreads = entries.map((entry) => ({
          ...entry.thread,
          commentCount: entry.commentCount,
          ...(entry.nextCommentCursor === null
            ? {}
            : { nextCommentsCursor: entry.nextCommentCursor }),
        }));
        return {
          comments: reviewThreadConversation(reviewThreads),
          dismissalsByReviewId,
          reviewThreads,
          commentCount: entries.reduce((total, entry) => total + entry.commentCount, 0),
          truncated: cursor !== null || entries.some((entry) => entry.nextCommentCursor !== null),
          reactions,
          reactionsById,
          reviewers,
          avatarsByLogin,
          botLogins,
          commitStats,
          commits,
          viewer,
        };
      }),

    listActorAvatars: (input) => {
      if (input.ids.length === 0) {
        return Effect.succeed(new Map<string, string>());
      }
      return graphqlRead({
        cwd: input.cwd,
        host: input.host,
        operation: "listActorAvatars",
        variables: input.ids.map((id) => ["-f", `ids[]=${id}`]),
        query: ACTOR_AVATARS_GRAPHQL_QUERY,
        decode: decodeActorAvatarsJson,
      });
    },

    getViewerAccess: (input) => {
      const { owner, name } = parseRepositorySelector(input.repository);
      return graphqlRead({
        cwd: input.cwd,
        host: input.host,
        operation: "getViewerAccess",
        ...(input.allowReserve === true ? { allowReserve: true } : {}),
        variables: [
          ["-f", `owner=${owner}`],
          ["-f", `name=${name}`],
          ["-F", `number=${input.number}`],
        ],
        query: VIEWER_PERMISSIONS_GRAPHQL_QUERY,
        decode: decodeViewerPermissionsJson,
      });
    },

    listReviewerCandidates: (input) => {
      const { owner, name } = parseRepositorySelector(input.repository);
      return graphqlRead({
        cwd: input.cwd,
        host: input.host,
        operation: "listReviewerCandidates",
        allowReserve: true,
        variables: [
          ["-f", `owner=${owner}`],
          ["-f", `name=${name}`],
          ["-F", `number=${input.number}`],
        ],
        query: REVIEWER_CANDIDATES_GRAPHQL_QUERY,
        decode: decodeReviewerCandidatesJson,
      });
    },

    setReviewerRequest: (input) => {
      const { owner, name } = parseRepositorySelector(input.repository);
      return github
        .execute({
          cwd: input.cwd,
          args: [
            "api",
            "--method",
            input.requested ? "POST" : "DELETE",
            "--hostname",
            input.host,
            `repos/${owner}/${name}/pulls/${input.number}/requested_reviewers`,
            "--input",
            "-",
          ],
          stdin: buildReviewerRequestJson(input.reviewers),
        })
        .pipe(Effect.asVoid);
    },

    listLabelCandidates: (input) => {
      const { owner, name } = parseRepositorySelector(input.repository);
      return graphqlRead({
        cwd: input.cwd,
        host: input.host,
        operation: "listLabelCandidates",
        allowReserve: true,
        variables: [
          ["-f", `owner=${owner}`],
          ["-f", `name=${name}`],
          ["-F", `number=${input.number}`],
        ],
        query: LABEL_CANDIDATES_GRAPHQL_QUERY,
        decode: decodeLabelCandidatesJson,
      });
    },

    setLabels: (input) => {
      const { owner, name } = parseRepositorySelector(input.repository);
      const issue = `repos/${owner}/${name}/issues/${input.number}/labels`;
      if (input.applied) {
        return github
          .execute({
            cwd: input.cwd,
            args: ["api", "--method", "POST", "--hostname", input.host, issue, "--input", "-"],
            stdin: buildLabelRequestJson(input.labels),
          })
          .pipe(Effect.asVoid);
      }
      return Effect.forEach(
        input.labels,
        (label) =>
          github.execute({
            cwd: input.cwd,
            args: [
              "api",
              "--method",
              "DELETE",
              "--hostname",
              input.host,
              `${issue}/${encodeURIComponent(label)}`,
            ],
          }),
        { concurrency: 1, discard: true },
      );
    },

    runPullRequestAction: (input) => {
      if (input.stackNumber !== undefined)
        return runGitHubStackAction({ ...input, stackNumber: input.stackNumber }).pipe(
          Effect.provideService(GitHubCli.GitHubCli, github),
        );
      if (input.action === "revert") {
        return pullRequestNodeId({ ...input, operation: "revertPullRequest" }).pipe(
          Effect.flatMap((pullRequestId) =>
            graphql({
              cwd: input.cwd,
              host: input.host,
              query: REVERT_PULL_REQUEST_GRAPHQL_MUTATION,
              variables: { pullRequestId },
            }),
          ),
        );
      }
      if (input.action === "approve-workflows") {
        const { owner, name } = parseRepositorySelector(input.repository);
        return getPullRequestDetail(input).pipe(
          Effect.flatMap((detail) => {
            if (detail.isCrossRepository !== true) return Effect.void;
            if (detail.headSha == null || detail.headRepositoryOwner == null) {
              return Effect.fail(
                new GitHubWorkflowApprovalHeadUnavailableError({
                  command: "gh",
                  cwd: input.cwd,
                  number: input.number,
                }),
              );
            }
            const expectedHeadSha = detail.headSha;
            const expectedHeadBranch = detail.headBranch;
            const expectedHeadRepositoryOwner = detail.headRepositoryOwner;
            return listWorkflowRunsRequiringApproval({
              ...input,
              headSha: expectedHeadSha,
              headBranch: expectedHeadBranch,
              headRepositoryOwner: expectedHeadRepositoryOwner,
              isCrossRepository: true,
            }).pipe(
              Effect.flatMap((runs) =>
                Effect.forEach(
                  runs,
                  (run) =>
                    getPullRequestDetail(input).pipe(
                      Effect.flatMap((current) => {
                        if (current.headSha == null || current.headRepositoryOwner == null) {
                          return Effect.fail(
                            new GitHubWorkflowApprovalHeadUnavailableError({
                              command: "gh",
                              cwd: input.cwd,
                              number: input.number,
                            }),
                          );
                        }
                        if (
                          current.isCrossRepository !== true ||
                          current.headSha !== expectedHeadSha ||
                          current.headBranch !== expectedHeadBranch ||
                          current.headRepositoryOwner.toLowerCase() !==
                            expectedHeadRepositoryOwner.toLowerCase()
                        ) {
                          return Effect.fail(
                            new GitHubWorkflowApprovalHeadChangedError({
                              command: "gh",
                              cwd: input.cwd,
                              number: input.number,
                            }),
                          );
                        }
                        return listWorkflowRunsRequiringApproval({
                          ...input,
                          headSha: current.headSha,
                          headBranch: current.headBranch,
                          headRepositoryOwner: current.headRepositoryOwner,
                          isCrossRepository: true,
                        });
                      }),
                      Effect.flatMap((currentRuns) =>
                        currentRuns.some((current) => current.id === run.id)
                          ? github
                              .execute({
                                cwd: input.cwd,
                                args: [
                                  "api",
                                  "--method",
                                  "POST",
                                  "--hostname",
                                  input.host,
                                  `repos/${owner}/${name}/actions/runs/${run.id}/approve`,
                                  "--silent",
                                ],
                              })
                              .pipe(Effect.asVoid)
                          : Effect.void,
                      ),
                    ),
                  { concurrency: 1, discard: true },
                ),
              ),
            );
          }),
        );
      }
      const [subcommand, ...flags] = actionArgs(
        input.action,
        input.mergeMethod,
        input.updateMethod,
      );
      return github
        .execute({
          cwd: input.cwd,
          args: ["pr", subcommand!, String(input.number), ...repositoryArgs(input), ...flags],
        })
        .pipe(Effect.asVoid);
    },

    commentOnPullRequest: (input) =>
      github
        .execute({
          cwd: input.cwd,
          args: [
            "pr",
            "comment",
            String(input.number),
            ...repositoryArgs(input),
            "--body-file",
            "-",
          ],
          stdin: input.body,
        })
        .pipe(Effect.asVoid),

    submitReview: (input) => {
      const { owner, name } = parseRepositorySelector(input.repository);
      return github
        .execute({
          cwd: input.cwd,
          args: [
            "api",
            "--method",
            "POST",
            "--hostname",
            input.host,
            `repos/${owner}/${name}/pulls/${input.number}/reviews`,
            "--input",
            "-",
          ],
          stdin: buildReviewSubmissionJson({
            verdict: input.verdict,
            body: input.body,
            comments: input.comments,
          }),
        })
        .pipe(Effect.asVoid);
    },

    replyToReviewThread: (input) =>
      graphql({
        cwd: input.cwd,
        host: input.host,
        query: REVIEW_THREAD_REPLY_GRAPHQL_MUTATION,
        variables: { threadId: input.threadId, body: input.body },
      }),

    getPullRequestFilesViewed: (input) => {
      const { owner, name } = parseRepositorySelector(input.repository);
      const read = (
        after: string | null,
        collected: ReadonlyArray<PullRequestFileViewed>,
        pagesLeft: number,
      ): Effect.Effect<GitHubPullRequestFilesViewed, GitHubPullRequestCliError> =>
        graphqlRead({
          cwd: input.cwd,
          host: input.host,
          operation: "getPullRequestFilesViewed",
          variables: [
            ["-f", `owner=${owner}`],
            ["-f", `name=${name}`],
            ["-F", `number=${input.number}`],
            ...(after === null
              ? []
              : ([["-f", `after=${after}`]] as ReadonlyArray<readonly [string, string]>)),
          ],
          query: PULL_REQUEST_FILES_VIEWED_GRAPHQL_QUERY,
          decode: decodePullRequestFilesViewedJson,
        }).pipe(
          Effect.flatMap((page) => {
            const files = [...collected, ...page.files];
            if (page.nextCursor === null) {
              return Effect.succeed({ files, truncated: false });
            }
            return pagesLeft <= 1
              ? Effect.succeed({ files, truncated: true })
              : read(page.nextCursor, files, pagesLeft - 1);
          }),
        );
      return read(null, [], FILES_VIEWED_MAX_PAGES);
    },

    setPullRequestFilesViewed: (input) => {
      const mutation = buildSetFilesViewedGraphQlMutation(input.files);
      if (mutation === null) return Effect.void;
      return pullRequestNodeId({ ...input, operation: "setPullRequestFilesViewed" }).pipe(
        Effect.flatMap((pullRequestId) =>
          graphql({
            cwd: input.cwd,
            host: input.host,
            query: mutation.query,
            variables: { pullRequestId, ...mutation.variables },
          }),
        ),
      );
    },

    setReviewThreadResolution: (input) =>
      graphql({
        cwd: input.cwd,
        host: input.host,
        query: input.resolved
          ? RESOLVE_REVIEW_THREAD_GRAPHQL_MUTATION
          : UNRESOLVE_REVIEW_THREAD_GRAPHQL_MUTATION,
        variables: { threadId: input.threadId },
      }),

    setReaction: (input) => {
      const givenSubjectId = input.subjectId;
      const subjectId =
        givenSubjectId === undefined
          ? pullRequestNodeId({ ...input, operation: "setReaction" })
          : subjectBelongsToPullRequest({
              ...input,
              subjectId: givenSubjectId,
              operation: "setReaction",
            }).pipe(
              Effect.flatMap((belongs) =>
                belongs
                  ? Effect.succeed(givenSubjectId)
                  : Effect.fail(
                      new GitHubSubjectScopeError({
                        command: "gh",
                        cwd: input.cwd,
                        operation: "setReaction",
                      }),
                    ),
              ),
            );
      return subjectId.pipe(
        Effect.flatMap((subjectId) =>
          graphql({
            cwd: input.cwd,
            host: input.host,
            query: input.reacted ? ADD_REACTION_GRAPHQL_MUTATION : REMOVE_REACTION_GRAPHQL_MUTATION,
            variables: { subjectId, content: gitHubReactionContent(input.content) },
          }),
        ),
      );
    },

    updatePullRequest: (input) =>
      pullRequestNodeId({ ...input, operation: "updatePullRequest" }).pipe(
        Effect.flatMap((pullRequestId) =>
          graphql({
            cwd: input.cwd,
            host: input.host,
            query: UPDATE_PULL_REQUEST_GRAPHQL_MUTATION,
            variables: {
              pullRequestId,
              ...(input.title === undefined ? {} : { title: input.title }),
              ...(input.body === undefined ? {} : { body: input.body }),
            },
          }),
        ),
      ),

    updateComment: (input) =>
      subjectBelongsToPullRequest({
        cwd: input.cwd,
        repository: input.repository,
        host: input.host,
        number: input.number,
        subjectId: input.commentId,
        operation: "updateComment",
      }).pipe(
        Effect.flatMap((belongs) =>
          belongs
            ? Effect.succeed(input.commentId)
            : Effect.fail(
                new GitHubSubjectScopeError({
                  command: "gh",
                  cwd: input.cwd,
                  operation: "updateComment",
                }),
              ),
        ),
        Effect.flatMap((commentId) =>
          graphql({
            cwd: input.cwd,
            host: input.host,
            query:
              input.kind === "issue-comment"
                ? UPDATE_ISSUE_COMMENT_GRAPHQL_MUTATION
                : UPDATE_REVIEW_COMMENT_GRAPHQL_MUTATION,
            variables: { commentId, body: input.body },
          }),
        ),
      ),
  });
});

export const layer = Layer.effect(GitHubPullRequestCli, make);

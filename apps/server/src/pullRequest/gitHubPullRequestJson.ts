import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type {
  PullRequestStackMembership,
  PullRequestActor,
  PullRequestPreview,
  PullRequestCheck,
  PullRequestCheckStatus,
  PullRequestChecksState,
  PullRequestComment,
  PullRequestCommit,
  PullRequestFileViewedState,
  PullRequestLabel,
  PullRequestMergeCapabilities,
  PullRequestMergeMethod,
  PullRequestOmittedFileStat,
  PullRequestMergeability,
  PullRequestReaction,
  PullRequestReactionContent,
  PullRequestReviewCommentDraft,
  PullRequestReviewDecision,
  PullRequestReviewPosition,
  PullRequestReviewThread,
  PullRequestReviewVerdict,
  PullRequestReviewerCandidate,
  PullRequestReviewerCandidateList,
  PullRequestReviewerKind,
  PullRequestLabelCandidate,
  PullRequestLabelCandidateList,
  PullRequestState,
  PullRequestThreadComment,
} from "@t3tools/contracts";
import { quoteGitPatchPath } from "@t3tools/shared/gitPatchPath";
import { decodeJsonResult } from "@t3tools/shared/schemaJson";

import { dedupeChecks } from "./pullRequestChecks.ts";

const RawActorSchema = Schema.Struct({
  __typename: Schema.optional(Schema.String),
  is_bot: Schema.optional(Schema.Boolean),
  login: Schema.optional(Schema.String),
  id: Schema.optional(Schema.NullOr(Schema.String)),
  name: Schema.optional(Schema.NullOr(Schema.String)),
  avatarUrl: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawLabelSchema = Schema.Struct({
  name: Schema.String,
  color: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawReviewRequestSchema = Schema.Struct({
  login: Schema.optional(Schema.NullOr(Schema.String)),
  slug: Schema.optional(Schema.NullOr(Schema.String)),
  name: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawLatestReviewSchema = Schema.Struct({
  author: Schema.optional(Schema.NullOr(RawActorSchema)),
  state: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawCheckSchema = Schema.Struct({
  __typename: Schema.optional(Schema.String),
  name: Schema.optional(Schema.NullOr(Schema.String)),
  context: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  conclusion: Schema.optional(Schema.NullOr(Schema.String)),
  state: Schema.optional(Schema.NullOr(Schema.String)),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  detailsUrl: Schema.optional(Schema.NullOr(Schema.String)),
  targetUrl: Schema.optional(Schema.NullOr(Schema.String)),
  workflowName: Schema.optional(Schema.NullOr(Schema.String)),
  startedAt: Schema.optional(Schema.NullOr(Schema.String)),
  completedAt: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawListItemSchema = Schema.Struct({
  number: Schema.Int,
  title: Schema.String,
  url: Schema.String,
  author: Schema.optional(Schema.NullOr(RawActorSchema)),
  headRefName: Schema.String,
  baseRefName: Schema.String,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  isDraft: Schema.optional(Schema.Boolean),
  mergeable: Schema.optional(Schema.NullOr(Schema.String)),
  reviewDecision: Schema.optional(Schema.NullOr(Schema.String)),
  additions: Schema.optional(Schema.Int),
  deletions: Schema.optional(Schema.Int),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  mergedAt: Schema.optional(Schema.NullOr(Schema.String)),
  reviewRequests: Schema.optional(Schema.Array(RawReviewRequestSchema)),
  latestReviews: Schema.optional(Schema.NullOr(Schema.Array(RawLatestReviewSchema))),
  labels: Schema.optional(Schema.Array(RawLabelSchema)),
  statusCheckRollup: Schema.optional(Schema.NullOr(Schema.Array(RawCheckSchema))),
});

const RawStackMembershipSchema = Schema.Struct({
  stack: Schema.optional(
    Schema.NullOr(
      Schema.Struct({ number: Schema.Int, size: Schema.Int, baseRefName: Schema.String }),
    ),
  ),
  stackEntry: Schema.optional(Schema.NullOr(Schema.Struct({ position: Schema.Int }))),
});

const RawSearchItemSchema = Schema.Struct({
  ...RawStackMembershipSchema.fields,
  number: Schema.Int,
  title: Schema.String,
  url: Schema.String,
  author: Schema.optional(Schema.NullOr(RawActorSchema)),
  headRefName: Schema.String,
  baseRefName: Schema.String,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  isDraft: Schema.optional(Schema.Boolean),
  mergeable: Schema.optional(Schema.NullOr(Schema.String)),
  reviewDecision: Schema.optional(Schema.NullOr(Schema.String)),
  latestReviews: Schema.optional(
    Schema.NullOr(Schema.Struct({ nodes: Schema.Array(Schema.NullOr(RawLatestReviewSchema)) })),
  ),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  mergedAt: Schema.optional(Schema.NullOr(Schema.String)),
  repository: Schema.optional(Schema.NullOr(Schema.Struct({ nameWithOwner: Schema.String }))),
  reviewRequests: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        nodes: Schema.optional(
          Schema.NullOr(
            Schema.Array(
              Schema.NullOr(
                Schema.Struct({
                  requestedReviewer: Schema.optional(Schema.NullOr(RawActorSchema)),
                }),
              ),
            ),
          ),
        ),
      }),
    ),
  ),
  labels: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        nodes: Schema.optional(Schema.NullOr(Schema.Array(Schema.NullOr(RawLabelSchema)))),
      }),
    ),
  ),
  commits: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        nodes: Schema.optional(
          Schema.NullOr(
            Schema.Array(
              Schema.NullOr(
                Schema.Struct({
                  commit: Schema.optional(
                    Schema.NullOr(
                      Schema.Struct({
                        statusCheckRollup: Schema.optional(
                          Schema.NullOr(Schema.Struct({ state: Schema.String })),
                        ),
                      }),
                    ),
                  ),
                }),
              ),
            ),
          ),
        ),
      }),
    ),
  ),
});

const RawSearchSchema = Schema.Struct({
  data: Schema.Struct({
    search: Schema.Struct({
      pageInfo: Schema.optional(Schema.NullOr(Schema.Struct({ hasNextPage: Schema.Boolean }))),
      nodes: Schema.optional(Schema.NullOr(Schema.Array(Schema.Unknown))),
    }),
  }),
});

const RawStatsSchema = Schema.Struct({
  data: Schema.optional(
    Schema.NullOr(
      Schema.Record(
        Schema.String,
        Schema.NullOr(
          Schema.Struct({
            pullRequest: Schema.optional(
              Schema.NullOr(
                Schema.Struct({
                  additions: Schema.optional(Schema.NullOr(Schema.Int)),
                  deletions: Schema.optional(Schema.NullOr(Schema.Int)),
                }),
              ),
            ),
          }),
        ),
      ),
    ),
  ),
});

const RawStackMembershipsSchema = Schema.Struct({
  data: Schema.Record(
    Schema.String,
    Schema.NullOr(Schema.Struct({ pullRequest: Schema.NullOr(RawStackMembershipSchema) })),
  ),
});

const REACTORS_PER_GROUP = 10;

const REACTION_GROUPS_FIELDS = `reactionGroups {
  content
  viewerHasReacted
  reactors(first: ${REACTORS_PER_GROUP}) {
    totalCount
    nodes {
      ... on User { login }
      ... on Bot { login }
      ... on Organization { login }
      ... on Mannequin { login }
    }
  }
}`;

const REACTION_CONTENT_BY_GITHUB: Readonly<Record<string, PullRequestReactionContent>> = {
  THUMBS_UP: "thumbs-up",
  THUMBS_DOWN: "thumbs-down",
  LAUGH: "laugh",
  HOORAY: "hooray",
  CONFUSED: "confused",
  HEART: "heart",
  ROCKET: "rocket",
  EYES: "eyes",
};

const GITHUB_REACTION_BY_CONTENT: Readonly<Record<PullRequestReactionContent, string>> = {
  "thumbs-up": "THUMBS_UP",
  "thumbs-down": "THUMBS_DOWN",
  laugh: "LAUGH",
  hooray: "HOORAY",
  confused: "CONFUSED",
  heart: "HEART",
  rocket: "ROCKET",
  eyes: "EYES",
};

export function gitHubReactionContent(content: PullRequestReactionContent): string {
  return GITHUB_REACTION_BY_CONTENT[content];
}

const RawReactionGroupsSchema = Schema.optional(
  Schema.NullOr(
    Schema.Array(
      Schema.Struct({
        content: Schema.optional(Schema.NullOr(Schema.String)),
        viewerHasReacted: Schema.optional(Schema.Boolean),
        reactors: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              totalCount: Schema.optional(Schema.Int),
              nodes: Schema.optional(
                Schema.NullOr(
                  Schema.Array(
                    Schema.NullOr(
                      Schema.Struct({ login: Schema.optional(Schema.NullOr(Schema.String)) }),
                    ),
                  ),
                ),
              ),
            }),
          ),
        ),
      }),
    ),
  ),
);

type RawReactionGroups = typeof RawReactionGroupsSchema.Type;

function toReactions(
  groups: RawReactionGroups,
  viewer: string | null,
): ReadonlyArray<PullRequestReaction> {
  const normalizedViewer = viewer?.toLowerCase() ?? null;
  const reactions: PullRequestReaction[] = [];
  for (const group of groups ?? []) {
    const content = REACTION_CONTENT_BY_GITHUB[trimmed(group.content)?.toUpperCase() ?? ""];
    if (content === undefined) continue;
    const logins = (group.reactors?.nodes ?? []).flatMap((node) => trimmed(node?.login) ?? []);
    const count = Math.max(group.reactors?.totalCount ?? logins.length, logins.length);
    if (count <= 0) continue;
    const actors =
      normalizedViewer === null
        ? logins
        : logins.filter((login) => login.toLowerCase() !== normalizedViewer);
    reactions.push({ content, count, actors, viewerHasReacted: group.viewerHasReacted === true });
  }
  return reactions;
}

const RawCommentSchema = Schema.Struct({
  id: Schema.String,
  author: Schema.optional(Schema.NullOr(RawActorSchema)),
  body: Schema.optional(Schema.String),
  createdAt: Schema.String,
  url: Schema.optional(Schema.NullOr(Schema.String)),
  reactionGroups: RawReactionGroupsSchema,
});

const RawReviewSchema = Schema.Struct({
  id: Schema.String,
  author: Schema.optional(Schema.NullOr(RawActorSchema)),
  body: Schema.optional(Schema.String),
  state: Schema.optional(Schema.NullOr(Schema.String)),
  submittedAt: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawCommitSchema = Schema.Struct({
  oid: Schema.String,
  messageHeadline: Schema.optional(Schema.String),
  committedDate: Schema.String,
  authors: Schema.optional(
    Schema.Array(
      Schema.Struct({
        email: Schema.optional(Schema.NullOr(Schema.String)),
        id: Schema.optional(Schema.NullOr(Schema.String)),
        login: Schema.optional(Schema.NullOr(Schema.String)),
        name: Schema.optional(Schema.NullOr(Schema.String)),
      }),
    ),
  ),
});

const RawDetailSchema = Schema.Struct({
  ...RawListItemSchema.fields,
  isCrossRepository: Schema.optional(Schema.Boolean),
  headRepositoryOwner: Schema.optional(Schema.NullOr(Schema.Struct({ login: Schema.String }))),
  headRefOid: Schema.optional(Schema.NullOr(Schema.String)),
  body: Schema.optional(Schema.String),
  changedFiles: Schema.optional(Schema.Int),
  closedAt: Schema.optional(Schema.NullOr(Schema.String)),
  autoMergeRequest: Schema.optional(
    Schema.NullOr(Schema.Struct({ mergeMethod: Schema.optional(Schema.NullOr(Schema.String)) })),
  ),
});

const RawWorkflowRunApprovalSchema = Schema.Struct({
  databaseId: Schema.Int,
  workflowName: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawPullRequestHeadSchema = Schema.Struct({
  number: Schema.Int,
  headRefOid: Schema.String,
  isCrossRepository: Schema.optional(Schema.Boolean),
  headRepositoryOwner: Schema.optional(Schema.NullOr(Schema.Struct({ login: Schema.String }))),
});

const RawActivitySchema = Schema.Struct({
  author: Schema.optional(Schema.NullOr(RawActorSchema)),
  comments: Schema.optional(Schema.Array(RawCommentSchema)),
  reviews: Schema.optional(Schema.Array(RawReviewSchema)),
  commits: Schema.optional(Schema.Array(RawCommitSchema)),
});

const RawPageInfoSchema = Schema.Struct({
  hasNextPage: Schema.optional(Schema.Boolean),
  endCursor: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawViewerFieldsSchema = Schema.Struct({
  viewerCanUpdate: Schema.optional(Schema.Boolean),
  viewerDidAuthor: Schema.optional(Schema.Boolean),
});

const RawThreadCommentsSchema = Schema.Struct({
  totalCount: Schema.optional(Schema.Int),
  pageInfo: Schema.optional(RawPageInfoSchema),
  nodes: Schema.Array(RawCommentSchema),
});

const RawReviewThreadsSchema = Schema.Struct({
  data: Schema.Struct({
    viewer: Schema.optional(
      Schema.NullOr(Schema.Struct({ login: Schema.optional(Schema.NullOr(Schema.String)) })),
    ),
    repository: Schema.Struct({
      pullRequest: Schema.Struct({
        reviewThreads: Schema.Struct({
          totalCount: Schema.optional(Schema.Int),
          pageInfo: Schema.optional(RawPageInfoSchema),
          nodes: Schema.Array(
            Schema.Struct({
              id: Schema.optional(Schema.NullOr(Schema.String)),
              isResolved: Schema.optional(Schema.Boolean),
              isOutdated: Schema.optional(Schema.Boolean),
              path: Schema.optional(Schema.NullOr(Schema.String)),
              line: Schema.optional(Schema.NullOr(Schema.Int)),
              diffSide: Schema.optional(Schema.NullOr(Schema.String)),
              comments: RawThreadCommentsSchema,
            }),
          ),
        }),
        ...RawViewerFieldsSchema.fields,
        author: Schema.optional(Schema.NullOr(RawActorSchema)),
        reactionGroups: RawReactionGroupsSchema,
        comments: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              nodes: Schema.Array(
                Schema.Struct({
                  id: Schema.optional(Schema.NullOr(Schema.String)),
                  author: Schema.optional(Schema.NullOr(RawActorSchema)),
                  reactionGroups: RawReactionGroupsSchema,
                }),
              ),
            }),
          ),
        ),
        reviews: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              nodes: Schema.Array(
                Schema.Struct({
                  id: Schema.optional(Schema.NullOr(Schema.String)),
                  author: Schema.optional(Schema.NullOr(RawActorSchema)),
                  reactionGroups: RawReactionGroupsSchema,
                }),
              ),
            }),
          ),
        ),
        reviewRequests: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              nodes: Schema.Array(
                Schema.Struct({
                  requestedReviewer: Schema.optional(Schema.NullOr(RawActorSchema)),
                }),
              ),
            }),
          ),
        ),
        latestReviews: Schema.optional(
          Schema.NullOr(Schema.Struct({ nodes: Schema.Array(RawLatestReviewSchema) })),
        ),
        reviewDismissals: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              pageInfo: Schema.optional(RawPageInfoSchema),
              nodes: Schema.Array(
                Schema.Struct({
                  dismissalMessage: Schema.optional(Schema.NullOr(Schema.String)),
                  review: Schema.optional(
                    Schema.NullOr(
                      Schema.Struct({ id: Schema.optional(Schema.NullOr(Schema.String)) }),
                    ),
                  ),
                }),
              ),
            }),
          ),
        ),
        commits: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              nodes: Schema.Array(
                Schema.Struct({
                  commit: Schema.Struct({
                    oid: Schema.String,
                    messageHeadline: Schema.optional(Schema.NullOr(Schema.String)),
                    committedDate: Schema.optional(Schema.NullOr(Schema.String)),
                    additions: Schema.optional(Schema.Int),
                    deletions: Schema.optional(Schema.Int),
                    parents: Schema.optional(
                      Schema.NullOr(Schema.Struct({ totalCount: Schema.optional(Schema.Int) })),
                    ),
                    authors: Schema.optional(
                      Schema.NullOr(
                        Schema.Struct({
                          nodes: Schema.Array(
                            Schema.Struct({
                              name: Schema.optional(Schema.NullOr(Schema.String)),
                              avatarUrl: Schema.optional(Schema.NullOr(Schema.String)),
                              user: Schema.optional(
                                Schema.NullOr(
                                  Schema.Struct({
                                    login: Schema.optional(Schema.NullOr(Schema.String)),
                                  }),
                                ),
                              ),
                            }),
                          ),
                        }),
                      ),
                    ),
                  }),
                }),
              ),
            }),
          ),
        ),
      }),
    }),
  }),
});

const RawRepositoryAccessSchema = Schema.Struct({
  mergeCommitAllowed: Schema.Boolean,
  squashMergeAllowed: Schema.Boolean,
  rebaseMergeAllowed: Schema.Boolean,
  viewerPermission: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawCoreSchema = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.Struct({
      ...RawRepositoryAccessSchema.fields,
      pullRequest: Schema.Struct({
        ...RawDetailSchema.fields,
        ...RawViewerFieldsSchema.fields,
        viewerCanUpdateBranch: Schema.Boolean,
        baseRef: Schema.NullOr(
          Schema.Struct({
            compare: Schema.NullOr(Schema.Struct({ behindBy: Schema.Int })),
          }),
        ),
        reviewRequests: Schema.Struct({
          nodes: Schema.Array(
            Schema.Struct({ requestedReviewer: Schema.NullOr(RawReviewRequestSchema) }),
          ),
        }),
        labels: Schema.Struct({ nodes: Schema.Array(RawLabelSchema) }),
        commits: Schema.Struct({
          nodes: Schema.Array(
            Schema.Struct({
              commit: Schema.Struct({
                statusCheckRollup: Schema.NullOr(
                  Schema.Struct({
                    contexts: Schema.Struct({
                      nodes: Schema.Array(
                        Schema.Struct({
                          ...RawCheckSchema.fields,
                          checkSuite: Schema.optional(
                            Schema.NullOr(
                              Schema.Struct({
                                workflowRun: Schema.NullOr(
                                  Schema.Struct({
                                    workflow: Schema.NullOr(Schema.Struct({ name: Schema.String })),
                                  }),
                                ),
                              }),
                            ),
                          ),
                        }),
                      ),
                      pageInfo: Schema.Struct({ hasNextPage: Schema.Boolean }),
                    }),
                  }),
                ),
              }),
            }),
          ),
        }),
      }),
    }),
  }),
});
const decodeCore = decodeJsonResult(RawCoreSchema);

const RawPullRequestFileSchema = Schema.Struct({
  filename: Schema.String,
  status: Schema.optional(Schema.NullOr(Schema.String)),
  previous_filename: Schema.optional(Schema.NullOr(Schema.String)),
  patch: Schema.optional(Schema.NullOr(Schema.String)),
  additions: Schema.optional(Schema.NullOr(Schema.Int)),
  deletions: Schema.optional(Schema.NullOr(Schema.Int)),
});

export const ACTOR_AVATARS_GRAPHQL_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on User { login avatarUrl }
    ... on Bot { login avatarUrl }
  }
}`;

const RawActorAvatarsSchema = Schema.Struct({
  data: Schema.Struct({
    nodes: Schema.Array(Schema.NullOr(RawActorSchema)),
  }),
});

const decodeActorAvatars = decodeJsonResult(RawActorAvatarsSchema);

export function decodeActorAvatarsJson(
  raw: string,
): Result.Result<ReadonlyMap<string, string>, DecodeFailure> {
  const decoded = decodeActorAvatars(raw);
  if (!Result.isSuccess(decoded)) {
    return Result.fail(decoded.failure);
  }
  const avatarsByLogin = new Map<string, string>();
  for (const node of decoded.success.data.nodes) {
    const login = trimmed(node?.login);
    const avatarUrl = trimmed(node?.avatarUrl);
    if (login !== null && avatarUrl !== null) avatarsByLogin.set(login, avatarUrl);
  }
  return Result.succeed(avatarsByLogin);
}

export const PULL_REQUEST_LIST_JSON_FIELDS =
  "number,title,url,author,headRefName,baseRefName,state,isDraft,mergeable,reviewDecision,additions,deletions,createdAt,updatedAt,mergedAt,reviewRequests,latestReviews,labels,statusCheckRollup";

export const PULL_REQUEST_DETAIL_JSON_FIELDS = `${PULL_REQUEST_LIST_JSON_FIELDS},body,changedFiles,closedAt,isCrossRepository,headRepositoryOwner,headRefOid,autoMergeRequest`;

export const PULL_REQUEST_CORE_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!, $headRef: String!) {
  repository(owner: $owner, name: $name) {
    mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed viewerPermission
    pullRequest(number: $number) {
      number title url body state isDraft mergeable reviewDecision
      additions deletions changedFiles createdAt updatedAt mergedAt closedAt
      headRefName baseRefName headRefOid isCrossRepository
      headRepositoryOwner { login }
      author { login avatarUrl ... on User { id name } }
      autoMergeRequest { mergeMethod }
      viewerCanUpdate viewerDidAuthor viewerCanUpdateBranch
      baseRef { compare(headRef: $headRef) { behindBy } }
      reviewRequests(first: 100) {
        nodes { requestedReviewer { ... on User { login name } ... on Bot { login } ... on Team { slug name } } }
      }
      labels(first: 100) { nodes { name color } }
      commits(last: 1) {
        nodes { commit { statusCheckRollup { contexts(first: 100) {
          nodes {
            __typename
            ... on StatusContext { context state targetUrl createdAt description }
            ... on CheckRun {
              name status conclusion startedAt completedAt detailsUrl
              checkSuite { workflowRun { workflow { name } } }
            }
          }
          pageInfo { hasNextPage }
        } } } }
      }
    }
  }
}`;

export const PULL_REQUEST_PREVIEW_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number title url state isDraft createdAt
      author { login avatarUrl ... on User { name } }
    }
  }
}`;

const decodePullRequestPreview = decodeJsonResult(
  Schema.Struct({
    data: Schema.Struct({
      repository: Schema.Struct({
        pullRequest: Schema.Struct({
          number: Schema.Int,
          title: Schema.String,
          url: Schema.String,
          state: Schema.String,
          isDraft: Schema.Boolean,
          createdAt: Schema.String,
          author: Schema.NullOr(RawActorSchema),
        }),
      }),
    }),
  }),
);

export function decodePullRequestPreviewJson(
  raw: string,
): Result.Result<Omit<PullRequestPreview, "projectId" | "repository">, DecodeFailure> {
  return Result.map(decodePullRequestPreview(raw), ({ data }) => ({
    ...data.repository.pullRequest,
    author: toActor(data.repository.pullRequest.author),
    state: toState(data.repository.pullRequest),
  }));
}

export const PULL_REQUEST_ACTIVITY_JSON_FIELDS = "author,comments,reviews,commits";

const GRAPHQL_PAGE_SIZE = 100;

export const PULL_REQUEST_SEARCH_MAX_ROWS = GRAPHQL_PAGE_SIZE;

export function pullRequestSearchGraphQlQuery(rows: number, includeStacks = false): string {
  return `query($q: String!) {
  search(query: $q, type: ISSUE, first: ${Math.min(Math.max(Math.trunc(rows), 1), PULL_REQUEST_SEARCH_MAX_ROWS)}) {
    pageInfo { hasNextPage }
    nodes {
      ... on PullRequest {
        ${includeStacks ? "stack { number size baseRefName } stackEntry { position }" : ""}
        number
        title
        url
        author { __typename login avatarUrl ... on User { name } }
        headRefName
        baseRefName
        state
        isDraft
        mergeable
        reviewDecision
        latestReviews(first: 20) { nodes { state author { login } } }
        createdAt
        updatedAt
        mergedAt
        repository { nameWithOwner }
        reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
        labels(first: 20) { nodes { name color } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;
}

export const REVIEW_THREADS_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: ${GRAPHQL_PAGE_SIZE}, after: $cursor) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          diffSide
          comments(first: 10) {
            totalCount
            pageInfo { hasNextPage endCursor }
            nodes { id author { __typename login avatarUrl } body createdAt url ${REACTION_GROUPS_FIELDS} }
          }
        }
      }
      viewerCanUpdate
      viewerDidAuthor
      author { __typename login avatarUrl }
      ${REACTION_GROUPS_FIELDS}
      comments(first: ${GRAPHQL_PAGE_SIZE}) {
        nodes { id author { __typename login avatarUrl } ${REACTION_GROUPS_FIELDS} }
      }
      reviews(first: ${GRAPHQL_PAGE_SIZE}) { nodes { id author { __typename login avatarUrl } ${REACTION_GROUPS_FIELDS} } }
      reviewRequests(first: 50) {
        nodes {
          requestedReviewer {
            ... on User { login name avatarUrl }
            ... on Bot { __typename login avatarUrl }
          }
        }
      }
      latestReviews(first: 50) {
        nodes { state author { __typename login avatarUrl } }
      }
      reviewDismissals: timelineItems(itemTypes: [REVIEW_DISMISSED_EVENT], first: ${GRAPHQL_PAGE_SIZE}) {
        pageInfo { hasNextPage endCursor }
        nodes { ... on ReviewDismissedEvent { dismissalMessage review { id } } }
      }
      commits(last: ${GRAPHQL_PAGE_SIZE}) {
        nodes {
          commit {
            oid
            messageHeadline
            committedDate
            additions
            deletions
            parents(first: 1) { totalCount }
            authors(first: 3) { nodes { name avatarUrl user { login } } }
          }
        }
      }
    }
  }
}`;

export const REVIEW_THREAD_COMMENTS_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!, $threadId: ID!, $cursor: String) {
  viewer { login }
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { id } }
  node(id: $threadId) {
    ... on PullRequestReviewThread {
      pullRequest { id }
      comments(first: ${GRAPHQL_PAGE_SIZE}, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id author { __typename login avatarUrl } body createdAt url ${REACTION_GROUPS_FIELDS} }
      }
    }
  }
}`;

const RawReviewThreadCommentsSchema = Schema.Struct({
  data: Schema.Struct({
    viewer: Schema.optional(
      Schema.NullOr(Schema.Struct({ login: Schema.optional(Schema.NullOr(Schema.String)) })),
    ),
    repository: Schema.NullOr(
      Schema.Struct({ pullRequest: Schema.NullOr(Schema.Struct({ id: Schema.String })) }),
    ),
    node: Schema.NullOr(
      Schema.Struct({
        pullRequest: Schema.optional(Schema.Struct({ id: Schema.String })),
        comments: Schema.optional(RawThreadCommentsSchema),
      }),
    ),
  }),
});

export const REVIEW_THREAD_REPLY_GRAPHQL_MUTATION = `mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    comment { id }
  }
}`;

export const PULL_REQUEST_NODE_ID_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { id } }
}`;

const RawPullRequestNodeIdSchema = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.Struct({
      pullRequest: Schema.Struct({ id: Schema.String }),
    }),
  }),
});

const decodePullRequestNodeId = decodeJsonResult(RawPullRequestNodeIdSchema);

export function decodePullRequestNodeIdJson(raw: string): Result.Result<string, DecodeFailure> {
  const decoded = decodePullRequestNodeId(raw);
  return Result.isSuccess(decoded)
    ? Result.succeed(decoded.success.data.repository.pullRequest.id)
    : Result.fail(decoded.failure);
}

export const REACTION_SUBJECT_PULL_REQUEST_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!, $subjectId: ID!) {
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { id } }
  node(id: $subjectId) {
    id
    ... on IssueComment { pullRequest { id } }
    ... on PullRequestReviewComment { pullRequest { id } }
    ... on PullRequestReview { pullRequest { id } }
  }
}`;

const RawReactionSubjectScopeSchema = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.NullOr(
      Schema.Struct({ pullRequest: Schema.NullOr(Schema.Struct({ id: Schema.String })) }),
    ),
    node: Schema.NullOr(
      Schema.Struct({
        id: Schema.String,
        pullRequest: Schema.optional(Schema.Struct({ id: Schema.String })),
      }),
    ),
  }),
});

const decodeReactionSubjectScope = decodeJsonResult(RawReactionSubjectScopeSchema);

export function decodeReactionSubjectScopeJson(raw: string): Result.Result<boolean, DecodeFailure> {
  const decoded = decodeReactionSubjectScope(raw);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  const expected = decoded.success.data.repository?.pullRequest?.id ?? null;
  const node = decoded.success.data.node;
  const actual = node === null ? null : (node.pullRequest?.id ?? node.id);
  return Result.succeed(expected !== null && actual !== null && expected === actual);
}

export const ADD_REACTION_GRAPHQL_MUTATION = `mutation($subjectId: ID!, $content: ReactionContent!) {
  addReaction(input: { subjectId: $subjectId, content: $content }) { reaction { content } }
}`;

export const REMOVE_REACTION_GRAPHQL_MUTATION = `mutation($subjectId: ID!, $content: ReactionContent!) {
  removeReaction(input: { subjectId: $subjectId, content: $content }) { reaction { content } }
}`;

export const RESOLVE_REVIEW_THREAD_GRAPHQL_MUTATION = `mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) { thread { isResolved } }
}`;

export const UNRESOLVE_REVIEW_THREAD_GRAPHQL_MUTATION = `mutation($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) { thread { isResolved } }
}`;

export const UPDATE_PULL_REQUEST_GRAPHQL_MUTATION = `mutation($pullRequestId: ID!, $title: String, $body: String) {
  updatePullRequest(input: { pullRequestId: $pullRequestId, title: $title, body: $body }) {
    pullRequest { id }
  }
}`;

export const REVERT_PULL_REQUEST_GRAPHQL_MUTATION = `mutation($pullRequestId: ID!) {
  revertPullRequest(input: { pullRequestId: $pullRequestId }) {
    revertPullRequest { id }
  }
}`;

export const UPDATE_ISSUE_COMMENT_GRAPHQL_MUTATION = `mutation($commentId: ID!, $body: String!) {
  updateIssueComment(input: { id: $commentId, body: $body }) { issueComment { id } }
}`;

export const UPDATE_REVIEW_COMMENT_GRAPHQL_MUTATION = `mutation($commentId: ID!, $body: String!) {
  updatePullRequestReviewComment(input: { pullRequestReviewCommentId: $commentId, body: $body }) {
    pullRequestReviewComment { id }
  }
}`;

const GraphQlRequestSchema = Schema.Struct({
  query: Schema.String,
  variables: Schema.Record(Schema.String, Schema.String),
});

const encodeGraphQlRequest = Schema.encodeSync(Schema.fromJsonString(GraphQlRequestSchema));

export function encodeGraphQlRequestJson(input: {
  readonly query: string;
  readonly variables: Readonly<Record<string, string>>;
}): string {
  return encodeGraphQlRequest({ query: input.query, variables: { ...input.variables } });
}

const ReviewSubmissionSchema = Schema.Struct({
  event: Schema.Literals(["COMMENT", "APPROVE", "REQUEST_CHANGES"]),
  body: Schema.String,
  comments: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      line: Schema.Int,
      side: Schema.Literals(["LEFT", "RIGHT"]),
      body: Schema.String,
    }),
  ),
});

const encodeReviewSubmission = Schema.encodeSync(Schema.fromJsonString(ReviewSubmissionSchema));

const REVIEW_EVENTS: Record<PullRequestReviewVerdict, "COMMENT" | "APPROVE" | "REQUEST_CHANGES"> = {
  comment: "COMMENT",
  approve: "APPROVE",
  "request-changes": "REQUEST_CHANGES",
};

export const REVIEW_DISMISSALS_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      timelineItems(itemTypes: [REVIEW_DISMISSED_EVENT], first: ${GRAPHQL_PAGE_SIZE}, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { ... on ReviewDismissedEvent { dismissalMessage review { id } } }
      }
    }
  }
}`;

function gitHubReviewPosition(position: PullRequestReviewPosition): {
  readonly line: number;
  readonly side: "LEFT" | "RIGHT";
} {
  switch (position.kind) {
    case "added":
      return { line: position.newLine, side: "RIGHT" };
    case "deleted":
      return { line: position.oldLine, side: "LEFT" };
    case "context":
      return position.side === "left"
        ? { line: position.oldLine, side: "LEFT" }
        : { line: position.newLine, side: "RIGHT" };
  }
}

export function buildReviewSubmissionJson(input: {
  readonly verdict: PullRequestReviewVerdict;
  readonly body: string;
  readonly comments: ReadonlyArray<PullRequestReviewCommentDraft>;
}): string {
  return encodeReviewSubmission({
    event: REVIEW_EVENTS[input.verdict],
    body: input.body,
    comments: input.comments.map((comment) => ({
      path: comment.path,
      ...gitHubReviewPosition(comment.position),
      body: comment.body,
    })),
  });
}

export interface GitHubPullRequestListItem {
  readonly stack?: PullRequestStackMembership;
  readonly authorId: string | null;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly author: PullRequestActor | null;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly state: PullRequestState;
  readonly isDraft: boolean;
  readonly mergeability: PullRequestMergeability;
  readonly reviewDecision: PullRequestReviewDecision | null;
  readonly additions: number;
  readonly deletions: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reviewRequestLogins: ReadonlyArray<string>;
  readonly hasTeamReviewRequest: boolean;
  readonly labels: ReadonlyArray<PullRequestLabel>;
  readonly checksState: PullRequestChecksState | null;
}

export interface GitHubPullRequestDetail extends GitHubPullRequestListItem {
  readonly isCrossRepository?: boolean;
  readonly headRepositoryOwner: string | null;
  readonly headSha?: string | null;
  readonly body: string;
  readonly changedFiles: number;
  readonly mergedAt: string | null;
  readonly closedAt: string | null;
  readonly checks: ReadonlyArray<PullRequestCheck>;
  readonly autoMergeEnabled?: boolean;
  readonly autoMergeMethod?: PullRequestMergeMethod;
}

export interface GitHubWorkflowRunApproval {
  readonly id: number;
  readonly name: string;
  readonly url: string | null;
}

export interface GitHubPullRequestHead {
  readonly number: number;
  readonly headSha: string;
  readonly isCrossRepository?: boolean;
  readonly headRepositoryOwner: string | null;
}

export interface GitHubPullRequestActivity {
  readonly author: PullRequestActor | null;
  readonly comments: ReadonlyArray<PullRequestComment>;
  readonly commits: ReadonlyArray<PullRequestCommit>;
}

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

function nextCursorOf(
  pageInfo: Schema.Schema.Type<typeof RawPageInfoSchema> | undefined,
): string | null {
  return pageInfo?.hasNextPage === true ? trimmed(pageInfo.endCursor) : null;
}

function toPullRequestViewerFields(
  raw: Schema.Schema.Type<typeof RawViewerFieldsSchema> | null | undefined,
): { readonly canUpdate: boolean; readonly didAuthor: boolean } {
  return { canUpdate: raw?.viewerCanUpdate !== false, didAuthor: raw?.viewerDidAuthor === true };
}

function toActor(raw: Schema.Schema.Type<typeof RawActorSchema> | null | undefined) {
  const login = trimmed(raw?.login);
  return login === null
    ? null
    : {
        login,
        name: trimmed(raw?.name),
        avatarUrl: trimmed(raw?.avatarUrl),
        ...(raw?.__typename === "Bot" || raw?.is_bot === true ? { isBot: true } : {}),
      };
}

function toCommitActor(
  raw: NonNullable<Schema.Schema.Type<typeof RawCommitSchema>["authors"]>[number],
): PullRequestActor | null {
  const login = trimmed(raw.login) ?? trimmed(raw.name) ?? trimmed(raw.email);
  return login === null ? null : { login, name: trimmed(raw.name), avatarUrl: null };
}

function toGraphqlCommitActor(raw: {
  readonly name?: string | null | undefined;
  readonly avatarUrl?: string | null | undefined;
  readonly user?: { readonly login?: string | null | undefined } | null | undefined;
}): PullRequestActor | null {
  const login = trimmed(raw.user?.login) ?? trimmed(raw.name);
  return login === null
    ? null
    : { login, name: trimmed(raw.name), avatarUrl: trimmed(raw.avatarUrl) };
}

function toState(raw: {
  readonly state?: string | null | undefined;
  readonly mergedAt?: string | null | undefined;
}): PullRequestState {
  if (trimmed(raw.mergedAt) !== null) return "merged";
  const state = raw.state?.trim().toUpperCase();
  if (state === "MERGED") return "merged";
  if (state === "CLOSED") return "closed";
  return "open";
}

function toMergeability(value: string | null | undefined): PullRequestMergeability {
  switch (value?.trim().toUpperCase()) {
    case "MERGEABLE":
      return "mergeable";
    case "CONFLICTING":
      return "conflicting";
    default:
      return "unknown";
  }
}

function toMergeMethod(value: string | null | undefined): PullRequestMergeMethod | undefined {
  switch (value?.trim().toUpperCase()) {
    case "MERGE":
      return "merge";
    case "SQUASH":
      return "squash";
    case "REBASE":
      return "rebase";
    default:
      return undefined;
  }
}

function toReviewDecisionWithReviews(
  value: string | null | undefined,
  latestReviews:
    | ReadonlyArray<Schema.Schema.Type<typeof RawLatestReviewSchema>>
    | { readonly nodes: ReadonlyArray<Schema.Schema.Type<typeof RawLatestReviewSchema>> }
    | null
    | undefined,
): PullRequestReviewDecision | null {
  const summarized = toReviewDecision(value);
  if (summarized === "approved" || summarized === "changes-requested") return summarized;
  const reviews =
    latestReviews === null || latestReviews === undefined
      ? []
      : "nodes" in latestReviews
        ? latestReviews.nodes
        : latestReviews;
  const states = new Set(reviews.map((review) => review.state?.trim().toUpperCase() ?? ""));
  if (states.has("CHANGES_REQUESTED")) return "changes-requested";
  if (states.has("APPROVED")) return "approved";
  return summarized;
}

function toReviewDecision(value: string | null | undefined): PullRequestReviewDecision | null {
  switch (value?.trim().toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes-requested";
    case "REVIEW_REQUIRED":
      return "review-required";
    default:
      return null;
  }
}

function toLabels(
  raw: ReadonlyArray<Schema.Schema.Type<typeof RawLabelSchema>> | undefined,
): ReadonlyArray<PullRequestLabel> {
  return (raw ?? []).flatMap((label) => {
    const name = trimmed(label.name);
    return name === null ? [] : [{ name, color: trimmed(label.color) }];
  });
}

function toReviewRequestLogins(
  raw: ReadonlyArray<Schema.Schema.Type<typeof RawReviewRequestSchema>> | undefined,
): ReadonlyArray<string> {
  return (raw ?? []).flatMap((request) => {
    const login = trimmed(request.login);
    return login === null ? [] : [login];
  });
}

function hasTeamReviewRequest(
  raw: ReadonlyArray<Schema.Schema.Type<typeof RawReviewRequestSchema>> | undefined,
): boolean {
  return (raw ?? []).some(
    (request) =>
      trimmed(request.login) === null &&
      (trimmed(request.slug) !== null || trimmed(request.name) !== null),
  );
}

function toCheckStatus(raw: Schema.Schema.Type<typeof RawCheckSchema>): PullRequestCheckStatus {
  const status = raw.status?.trim().toUpperCase();
  if (status !== undefined && status !== "COMPLETED" && status !== "") {
    return "pending";
  }
  switch ((raw.conclusion ?? raw.state)?.trim().toUpperCase()) {
    case "SUCCESS":
      return "success";
    case "ACTION_REQUIRED":
      return "action-required";
    case "FAILURE":
    case "ERROR":
    case "TIMED_OUT":
    case "STARTUP_FAILURE":
      return "failure";
    case "CANCELLED":
      return "cancelled";
    case "SKIPPED":
      return "skipped";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return "neutral";
  }
}

const UNSET_TIMESTAMP = "0001-01-01T00:00:00Z";

function realTimestamp(value: string | null | undefined): string | null {
  const at = trimmed(value);
  return at === null || at === UNSET_TIMESTAMP ? null : at;
}

function isNamelessCheck(raw: Schema.Schema.Type<typeof RawCheckSchema>): boolean {
  return trimmed(raw.name) === null && trimmed(raw.context) === null;
}

function toCheckEntries(
  raw: ReadonlyArray<Schema.Schema.Type<typeof RawCheckSchema>> | null | undefined,
): ReadonlyArray<{
  readonly check: PullRequestCheck;
  readonly workflowName: string | null;
  readonly at: string | null;
}> {
  return (raw ?? []).flatMap((check) => {
    const name = trimmed(check.name) ?? trimmed(check.context);
    if (name === null) return [];
    return [
      {
        check: {
          name,
          status: toCheckStatus(check),
          description: trimmed(check.description),
          url: trimmed(check.detailsUrl) ?? trimmed(check.targetUrl),
        },
        workflowName: trimmed(check.workflowName),
        at: realTimestamp(check.completedAt) ?? realTimestamp(check.startedAt),
      },
    ];
  });
}

function rollupChecksState(
  raw: ReadonlyArray<Schema.Schema.Type<typeof RawCheckSchema>> | null | undefined,
): PullRequestChecksState | null {
  const statuses = [
    ...toChecks(raw).map((check) => check.status),
    ...(raw ?? []).filter(isNamelessCheck).map((check) => toCheckStatus(check)),
  ];
  if (statuses.length === 0) return null;
  if (statuses.includes("failure") || statuses.includes("cancelled")) return "failing";
  if (statuses.includes("pending") || statuses.includes("action-required")) return "pending";
  return statuses.includes("success") ? "passing" : null;
}

function toChecks(
  raw: ReadonlyArray<Schema.Schema.Type<typeof RawCheckSchema>> | null | undefined,
): ReadonlyArray<PullRequestCheck> {
  return dedupeChecks(toCheckEntries(raw));
}

function isReviewVerdict(reviewState: string | null): boolean {
  switch (reviewState?.toUpperCase()) {
    case "APPROVED":
    case "CHANGES_REQUESTED":
    case "DISMISSED":
      return true;
    default:
      return false;
  }
}

function toComments(raw: {
  readonly comments?: ReadonlyArray<Schema.Schema.Type<typeof RawCommentSchema>> | undefined;
  readonly reviews?: ReadonlyArray<Schema.Schema.Type<typeof RawReviewSchema>> | undefined;
}): ReadonlyArray<PullRequestComment> {
  const issueComments = (raw.comments ?? []).map((comment): PullRequestComment => ({
    id: comment.id,
    kind: "issue-comment",
    author: toActor(comment.author),
    body: comment.body ?? "",
    createdAt: comment.createdAt,
    url: trimmed(comment.url),
    path: null,
    reviewState: null,
  }));
  const reviews = (raw.reviews ?? []).flatMap((review): ReadonlyArray<PullRequestComment> => {
    const submittedAt = trimmed(review.submittedAt);
    const reviewState = trimmed(review.state);
    if (
      submittedAt === null ||
      ((review.body ?? "").trim().length === 0 && !isReviewVerdict(reviewState))
    ) {
      return [];
    }
    return [
      {
        id: review.id,
        kind: "review",
        author: toActor(review.author),
        body: review.body ?? "",
        createdAt: submittedAt,
        url: trimmed(review.url),
        path: null,
        reviewState,
      },
    ];
  });
  return [...issueComments, ...reviews].toSorted((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

function toCommits(
  commits: ReadonlyArray<Schema.Schema.Type<typeof RawCommitSchema>> | undefined,
): ReadonlyArray<PullRequestCommit> {
  return (commits ?? []).map((commit) => ({
    oid: commit.oid,
    messageHeadline: commit.messageHeadline ?? "",
    committedDate: commit.committedDate,
    authors: (commit.authors ?? []).flatMap((author) => {
      const actor = toCommitActor(author);
      return actor === null ? [] : [actor];
    }),
  }));
}

function toListItem(raw: Schema.Schema.Type<typeof RawListItemSchema>): GitHubPullRequestListItem {
  return {
    authorId: trimmed(raw.author?.id),
    number: raw.number,
    title: raw.title,
    url: raw.url,
    author: toActor(raw.author),
    headBranch: raw.headRefName,
    baseBranch: raw.baseRefName,
    state: toState(raw),
    isDraft: raw.isDraft ?? false,
    mergeability: toMergeability(raw.mergeable),
    reviewDecision: toReviewDecisionWithReviews(raw.reviewDecision, raw.latestReviews),
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    reviewRequestLogins: toReviewRequestLogins(raw.reviewRequests),
    hasTeamReviewRequest: hasTeamReviewRequest(raw.reviewRequests),
    labels: toLabels(raw.labels),
    checksState: rollupChecksState(raw.statusCheckRollup),
  };
}

function toDetail(raw: Schema.Schema.Type<typeof RawDetailSchema>): GitHubPullRequestDetail {
  const autoMergeMethod = toMergeMethod(raw.autoMergeRequest?.mergeMethod);
  return {
    ...toListItem(raw),
    ...(typeof raw.isCrossRepository === "boolean"
      ? { isCrossRepository: raw.isCrossRepository }
      : {}),
    headRepositoryOwner: trimmed(raw.headRepositoryOwner?.login),
    headSha: trimmed(raw.headRefOid),
    body: raw.body ?? "",
    changedFiles: raw.changedFiles ?? 0,
    mergedAt: trimmed(raw.mergedAt),
    closedAt: trimmed(raw.closedAt),
    checks: toChecks(raw.statusCheckRollup),
    ...(raw.autoMergeRequest === undefined
      ? {}
      : { autoMergeEnabled: raw.autoMergeRequest !== null }),
    ...(autoMergeMethod === undefined ? {} : { autoMergeMethod }),
  };
}

function toActivity(raw: Schema.Schema.Type<typeof RawActivitySchema>): GitHubPullRequestActivity {
  return {
    author: toActor(raw.author),
    comments: toComments(raw),
    commits: toCommits(raw.commits),
  };
}

const decodeUnknownList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodeListEntry = Schema.decodeUnknownExit(RawListItemSchema);
const decodeSearch = decodeJsonResult(RawSearchSchema);
const decodeSearchItem = Schema.decodeUnknownExit(RawSearchItemSchema);
const decodeStats = decodeJsonResult(RawStatsSchema);
const decodeDetail = decodeJsonResult(RawDetailSchema);
const decodeWorkflowRunApprovals = decodeJsonResult(Schema.Array(RawWorkflowRunApprovalSchema));
const decodePullRequestHeads = decodeJsonResult(Schema.Array(RawPullRequestHeadSchema));
const decodeActivity = decodeJsonResult(RawActivitySchema);
const decodeFileEntry = Schema.decodeUnknownExit(RawPullRequestFileSchema);
const decodeReviewThreads = decodeJsonResult(RawReviewThreadsSchema);
const decodeReviewThreadComments = decodeJsonResult(RawReviewThreadCommentsSchema);

type DecodeFailure = Cause.Cause<Schema.SchemaError>;

export interface GitHubPullRequestListBatch {
  readonly items: ReadonlyArray<GitHubPullRequestListItem>;
  readonly rawCount: number;
}

export function decodePullRequestListJson(
  raw: string,
): Result.Result<GitHubPullRequestListBatch, DecodeFailure> {
  const decoded = decodeUnknownList(raw);
  if (!Result.isSuccess(decoded)) {
    return Result.fail(decoded.failure);
  }
  const items: GitHubPullRequestListItem[] = [];
  for (const entry of decoded.success) {
    const item = decodeListEntry(entry);
    if (Exit.isSuccess(item)) {
      items.push(toListItem(item.value));
    }
  }
  return Result.succeed({ items, rawCount: decoded.success.length });
}

export interface GitHubPullRequestSearchItem extends GitHubPullRequestListItem {
  readonly repository: string;
}

export interface GitHubPullRequestSearchBatch {
  readonly items: ReadonlyArray<GitHubPullRequestSearchItem>;
  readonly rawCount: number;
  readonly hasNextPage: boolean;
}

export function decodePullRequestSearchJson(
  raw: string,
): Result.Result<GitHubPullRequestSearchBatch, DecodeFailure> {
  const decoded = decodeSearch(raw);
  if (!Result.isSuccess(decoded)) {
    return Result.fail(decoded.failure);
  }
  const nodes = decoded.success.data.search.nodes ?? [];
  const items: GitHubPullRequestSearchItem[] = [];
  for (const entry of nodes) {
    const decodedNode = decodeSearchItem(entry);
    if (!Exit.isSuccess(decodedNode)) continue;
    const node = decodedNode.value;
    const repository = trimmed(node.repository?.nameWithOwner);
    if (repository === null) continue;
    const stack = toStackMembership(node);
    items.push({
      ...toListItem({
        ...node,
        latestReviews: (node.latestReviews?.nodes ?? []).flatMap((review) =>
          review === null ? [] : [review],
        ),
        reviewRequests: (node.reviewRequests?.nodes ?? []).flatMap((request) => {
          const login = trimmed(request?.requestedReviewer?.login);
          return login === null ? [] : [{ login }];
        }),
        labels: (node.labels?.nodes ?? []).flatMap((label) => (label === null ? [] : [label])),
        statusCheckRollup: (node.commits?.nodes ?? []).flatMap((commitNode) => {
          const state = trimmed(commitNode?.commit?.statusCheckRollup?.state);
          return state === null ? [] : [{ state }];
        }),
      }),
      ...(stack === undefined ? {} : { stack }),
      repository,
    });
  }
  return Result.succeed({
    items,
    rawCount: nodes.length,
    hasNextPage: decoded.success.data.search.pageInfo?.hasNextPage ?? false,
  });
}

function toStackMembership(
  raw: Schema.Schema.Type<typeof RawStackMembershipSchema>,
): PullRequestStackMembership | undefined {
  return raw.stack && raw.stackEntry
    ? {
        number: raw.stack.number,
        size: raw.stack.size,
        base: raw.stack.baseRefName,
        position: raw.stackEntry.position,
      }
    : undefined;
}

const REPOSITORY_PART = /^[A-Za-z0-9._-]+$/;

export function buildPullRequestStatsGraphQlQuery(
  changeRequests: ReadonlyArray<{ readonly repository: string; readonly number: number }>,
): string | null {
  if (changeRequests.length === 0) return null;
  const selections: string[] = [];
  for (const [index, changeRequest] of changeRequests.entries()) {
    const [owner, name, ...rest] = changeRequest.repository.trim().split("/");
    if (rest.length > 0 || owner === undefined || name === undefined) return null;
    if (!REPOSITORY_PART.test(owner) || !REPOSITORY_PART.test(name)) return null;
    if (!Number.isSafeInteger(changeRequest.number) || changeRequest.number <= 0) return null;
    selections.push(
      `  s${index}: repository(owner: "${owner}", name: "${name}") { pullRequest(number: ${changeRequest.number}) { additions deletions } }`,
    );
  }
  return `query {\n${selections.join("\n")}\n}`;
}

export function buildPullRequestStackMembershipsGraphQlQuery(
  repository: string,
  numbers: ReadonlyArray<number>,
): string | null {
  if (numbers.length === 0) return null;
  const [owner, name, ...rest] = repository.trim().split("/");
  if (rest.length > 0 || owner === undefined || name === undefined) return null;
  if (!REPOSITORY_PART.test(owner) || !REPOSITORY_PART.test(name)) return null;
  const selections: string[] = [];
  for (const [index, number] of numbers.entries()) {
    if (!Number.isSafeInteger(number) || number <= 0) return null;
    selections.push(
      `  s${index}: repository(owner: "${owner}", name: "${name}") { pullRequest(number: ${number}) { stack { number size baseRefName } stackEntry { position } } }`,
    );
  }
  return `query PullRequestStackMemberships {\n${selections.join("\n")}\n}`;
}

const decodeStackMemberships = decodeJsonResult(RawStackMembershipsSchema);

export function decodePullRequestStackMembershipsJson(
  raw: string,
): Result.Result<ReadonlyMap<number, PullRequestStackMembership>, DecodeFailure> {
  const decoded = decodeStackMemberships(raw);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  const memberships = new Map<number, PullRequestStackMembership>();
  for (const [alias, value] of Object.entries(decoded.success.data)) {
    const index = /^s(\d+)$/.exec(alias)?.[1];
    if (index === undefined || value?.pullRequest == null) continue;
    const stack = toStackMembership(value.pullRequest);
    if (stack !== undefined) memberships.set(Number(index), stack);
  }
  return Result.succeed(memberships);
}

export function decodePullRequestStatsJson(
  raw: string,
): Result.Result<
  ReadonlyMap<number, { readonly additions: number; readonly deletions: number }>,
  DecodeFailure
> {
  const decoded = decodeStats(raw);
  if (!Result.isSuccess(decoded)) {
    return Result.fail(decoded.failure);
  }
  const stats = new Map<number, { readonly additions: number; readonly deletions: number }>();
  for (const [alias, value] of Object.entries(decoded.success.data ?? {})) {
    const index = /^s(\d+)$/.exec(alias)?.[1];
    const pullRequest = value?.pullRequest;
    if (index === undefined || pullRequest == null) continue;
    stats.set(Number(index), {
      additions: pullRequest.additions ?? 0,
      deletions: pullRequest.deletions ?? 0,
    });
  }
  return Result.succeed(stats);
}

const PULL_REQUEST_SUMMARY_SELECTION =
  "number title url state isDraft mergeable reviewDecision additions deletions changedFiles " +
  "updatedAt mergedAt closedAt headRefName baseRefName " +
  "author { __typename login avatarUrl ... on User { name } } " +
  "latestReviews(first: 20) { nodes { state author { login } } } " +
  "commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }";

export function buildPullRequestSummariesGraphQlQuery(
  changeRequests: ReadonlyArray<{ readonly repository: string; readonly number: number }>,
): string | null {
  if (changeRequests.length === 0) return null;
  const selections: string[] = [];
  for (const [index, changeRequest] of changeRequests.entries()) {
    const [owner, name, ...rest] = changeRequest.repository.trim().split("/");
    if (rest.length > 0 || owner === undefined || name === undefined) return null;
    if (!REPOSITORY_PART.test(owner) || !REPOSITORY_PART.test(name)) return null;
    if (!Number.isSafeInteger(changeRequest.number) || changeRequest.number <= 0) return null;
    selections.push(
      `  s${index}: repository(owner: "${owner}", name: "${name}") { pullRequest(number: ${changeRequest.number}) { ${PULL_REQUEST_SUMMARY_SELECTION} } }`,
    );
  }
  return `query PullRequestSummaries {\n${selections.join("\n")}\n}`;
}

const RawSummarySchema = Schema.Struct({
  ...RawSearchItemSchema.fields,
  changedFiles: Schema.optional(Schema.NullOr(Schema.Int)),
  additions: Schema.optional(Schema.NullOr(Schema.Int)),
  deletions: Schema.optional(Schema.NullOr(Schema.Int)),
  closedAt: Schema.optional(Schema.NullOr(Schema.String)),
  createdAt: Schema.optional(Schema.String),
});
const decodeSummaries = decodeJsonResult(
  Schema.Struct({
    data: Schema.optional(
      Schema.NullOr(
        Schema.Record(
          Schema.String,
          Schema.NullOr(Schema.Struct({ pullRequest: Schema.optional(Schema.Unknown) })),
        ),
      ),
    ),
  }),
);
const decodeSummaryEntry = Schema.decodeUnknownExit(RawSummarySchema);

export interface GitHubPullRequestSummary {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly state: PullRequestState;
  readonly isDraft: boolean;
  readonly closedAt: string | null;
  readonly mergedAt: string | null;
  readonly updatedAt: string;
  readonly author: PullRequestActor | null;
  readonly additions: number;
  readonly deletions: number;
  readonly changedFiles: number;
  readonly reviewDecision: PullRequestReviewDecision | null;
  readonly checksState: PullRequestChecksState | null;
  readonly mergeability: PullRequestMergeability;
}

export function decodePullRequestSummariesJson(
  raw: string,
): Result.Result<ReadonlyMap<number, GitHubPullRequestSummary>, DecodeFailure> {
  const decoded = decodeSummaries(raw);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  const summaries = new Map<number, GitHubPullRequestSummary>();
  for (const [alias, value] of Object.entries(decoded.success.data ?? {})) {
    const index = /^s(\d+)$/.exec(alias)?.[1];
    if (index === undefined || value?.pullRequest == null) continue;
    const entry = decodeSummaryEntry(value.pullRequest);
    if (!Exit.isSuccess(entry)) continue;
    const pr = entry.value;
    summaries.set(Number(index), {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      headBranch: pr.headRefName,
      baseBranch: pr.baseRefName,
      state: toState(pr),
      isDraft: pr.isDraft ?? false,
      closedAt: trimmed(pr.closedAt),
      mergedAt: trimmed(pr.mergedAt),
      updatedAt: pr.updatedAt,
      author: toActor(pr.author),
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      changedFiles: pr.changedFiles ?? 0,
      reviewDecision: toReviewDecisionWithReviews(
        pr.reviewDecision,
        (pr.latestReviews?.nodes ?? []).flatMap((review) => (review === null ? [] : [review])),
      ),
      checksState: rollupChecksState(
        (pr.commits?.nodes ?? []).flatMap((commitNode) => {
          const state = trimmed(commitNode?.commit?.statusCheckRollup?.state);
          return state === null ? [] : [{ state }];
        }),
      ),
      mergeability: toMergeability(pr.mergeable),
    });
  }
  return Result.succeed(summaries);
}

export interface GitHubPullRequestCore extends GitHubPullRequestDetail {
  readonly viewerAccess: GitHubViewerAccess & GitHubRepositoryAccess;
  readonly comparison: GitHubBaseComparison | null;
  readonly checksTruncated: boolean;
}

export function decodePullRequestCoreJson(
  raw: string,
): Result.Result<GitHubPullRequestCore, DecodeFailure> {
  const decoded = decodeCore(raw);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  const repository = decoded.success.data.repository;
  const pr = repository.pullRequest;
  const contexts = pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
  return Result.succeed({
    ...toDetail({
      ...pr,
      reviewRequests: pr.reviewRequests.nodes.flatMap(({ requestedReviewer }) =>
        requestedReviewer === null ? [] : [requestedReviewer],
      ),
      labels: pr.labels.nodes,
      statusCheckRollup:
        contexts?.nodes.map((check) => ({
          ...check,
          workflowName: check.checkSuite?.workflowRun?.workflow?.name ?? null,
        })) ?? [],
    }),
    viewerAccess: {
      canWrite: toCanWrite(repository.viewerPermission),
      canTriage: toCanTriage(repository.viewerPermission),
      ...toPullRequestViewerFields(pr),
      mergeCapabilities: {
        merge: repository.mergeCommitAllowed,
        squash: repository.squashMergeAllowed,
        rebase: repository.rebaseMergeAllowed,
      },
    },
    comparison:
      pr.state !== "OPEN" || pr.baseRef?.compare == null
        ? null
        : {
            behindBy: pr.baseRef.compare.behindBy,
            viewerCanUpdate: pr.viewerCanUpdateBranch,
          },
    checksTruncated: contexts?.pageInfo.hasNextPage === true,
  });
}

export function decodePullRequestDetailJson(
  raw: string,
): Result.Result<GitHubPullRequestDetail, DecodeFailure> {
  const decoded = decodeDetail(raw);
  return Result.isSuccess(decoded)
    ? Result.succeed(toDetail(decoded.success))
    : Result.fail(decoded.failure);
}

export function decodeWorkflowRunApprovalsJson(
  raw: string,
): Result.Result<ReadonlyArray<GitHubWorkflowRunApproval>, DecodeFailure> {
  const decoded = decodeWorkflowRunApprovals(raw);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  return Result.succeed(
    decoded.success.map((run) => ({
      id: run.databaseId,
      name: trimmed(run.workflowName) ?? `Workflow run ${run.databaseId}`,
      url: trimmed(run.url),
    })),
  );
}

export function decodePullRequestHeadsJson(
  raw: string,
): Result.Result<ReadonlyArray<GitHubPullRequestHead>, DecodeFailure> {
  const decoded = decodePullRequestHeads(raw);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  return Result.succeed(
    decoded.success.map((pullRequest) => ({
      number: pullRequest.number,
      headSha: pullRequest.headRefOid,
      ...(typeof pullRequest.isCrossRepository === "boolean"
        ? { isCrossRepository: pullRequest.isCrossRepository }
        : {}),
      headRepositoryOwner: trimmed(pullRequest.headRepositoryOwner?.login),
    })),
  );
}

export function decodePullRequestActivityJson(
  raw: string,
): Result.Result<GitHubPullRequestActivity, DecodeFailure> {
  const decoded = decodeActivity(raw);
  return Result.isSuccess(decoded)
    ? Result.succeed(toActivity(decoded.success))
    : Result.fail(decoded.failure);
}

export interface GitHubReviewThreadComments {
  readonly comments: ReadonlyArray<PullRequestComment>;
  readonly dismissalsByReviewId: ReadonlyMap<string, string>;
  readonly reviewThreads: ReadonlyArray<PullRequestReviewThread>;
  readonly commentCount: number;
  readonly truncated: boolean;
  readonly reactions: ReadonlyArray<PullRequestReaction>;
  readonly reactionsById: ReadonlyMap<string, ReadonlyArray<PullRequestReaction>>;
  readonly reviewers: ReadonlyArray<PullRequestActor>;
  readonly avatarsByLogin: ReadonlyMap<string, string>;
  readonly botLogins: ReadonlySet<string>;
  readonly commitStats: ReadonlyMap<
    string,
    { readonly additions: number; readonly deletions: number }
  >;
  readonly commits: ReadonlyArray<PullRequestCommit>;
  readonly viewer: { readonly canUpdate: boolean; readonly didAuthor: boolean };
}

export interface GitHubReviewThreadEntry {
  readonly thread: PullRequestReviewThread;
  readonly commentCount: number;
  readonly nextCommentCursor: string | null;
}

export interface GitHubReviewThreadPage {
  readonly threads: ReadonlyArray<GitHubReviewThreadEntry>;
  readonly nextCursor: string | null;
  readonly reactions: ReadonlyArray<PullRequestReaction>;
  readonly reactionsById: ReadonlyMap<string, ReadonlyArray<PullRequestReaction>>;
  readonly reviewers: ReadonlyArray<PullRequestActor>;
  readonly avatarsByLogin: ReadonlyMap<string, string>;
  readonly botLogins: ReadonlySet<string>;
  readonly commitStats: ReadonlyMap<
    string,
    { readonly additions: number; readonly deletions: number }
  >;
  readonly commits: ReadonlyArray<PullRequestCommit>;
  readonly viewer: { readonly canUpdate: boolean; readonly didAuthor: boolean };
  readonly dismissalsByReviewId: ReadonlyMap<string, string>;
  readonly nextDismissalCursor: string | null;
}

export function reviewThreadConversation(
  threads: ReadonlyArray<PullRequestReviewThread>,
): ReadonlyArray<PullRequestComment> {
  return threads.flatMap((thread) =>
    thread.comments.map((comment): PullRequestComment => ({
      id: comment.id,
      kind: "review-comment",
      author: comment.author,
      body: comment.body,
      createdAt: comment.createdAt,
      url: comment.url,
      path: thread.path,
      reviewState: null,
      reactions: comment.reactions ?? [],
    })),
  );
}

function toDismissalEntries(
  nodes:
    | ReadonlyArray<{
        readonly dismissalMessage?: string | null | undefined;
        readonly review?: { readonly id?: string | null | undefined } | null | undefined;
      }>
    | undefined,
): Map<string, string> {
  const entries = new Map<string, string>();
  for (const node of nodes ?? []) {
    const reviewId = trimmed(node.review?.id);
    const message = trimmed(node.dismissalMessage);
    if (reviewId !== null && message !== null) entries.set(reviewId, message);
  }
  return entries;
}

const RawReviewDismissalsSchema = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.Struct({
      pullRequest: Schema.Struct({
        timelineItems: Schema.Struct({
          pageInfo: Schema.optional(RawPageInfoSchema),
          nodes: Schema.Array(
            Schema.Struct({
              dismissalMessage: Schema.optional(Schema.NullOr(Schema.String)),
              review: Schema.optional(
                Schema.NullOr(Schema.Struct({ id: Schema.optional(Schema.NullOr(Schema.String)) })),
              ),
            }),
          ),
        }),
      }),
    }),
  }),
});

const decodeReviewDismissals = decodeJsonResult(RawReviewDismissalsSchema);

export function decodeReviewDismissalsJson(raw: string): Result.Result<
  {
    readonly dismissalsByReviewId: ReadonlyMap<string, string>;
    readonly nextCursor: string | null;
  },
  DecodeFailure
> {
  const decoded = decodeReviewDismissals(raw);
  if (!Result.isSuccess(decoded)) {
    return Result.fail(decoded.failure);
  }
  const items = decoded.success.data.repository.pullRequest.timelineItems;
  return Result.succeed({
    dismissalsByReviewId: toDismissalEntries(items.nodes),
    nextCursor: nextCursorOf(items.pageInfo),
  });
}

export function decodeReviewThreadsJson(
  raw: string,
): Result.Result<GitHubReviewThreadPage, DecodeFailure> {
  const decoded = decodeReviewThreads(raw);
  if (!Result.isSuccess(decoded)) {
    return Result.fail(decoded.failure);
  }
  const viewer = trimmed(decoded.success.data.viewer?.login);
  const threads = decoded.success.data.repository.pullRequest.reviewThreads;
  const entries = threads.nodes.flatMap((thread): ReadonlyArray<GitHubReviewThreadEntry> => {
    const path = trimmed(thread.path);
    const id = trimmed(thread.id);
    if (path === null || id === null || thread.comments.nodes.length === 0) return [];
    return [
      {
        thread: {
          id,
          path,
          line:
            thread.line !== null && thread.line !== undefined && thread.line > 0
              ? thread.line
              : null,
          side: thread.diffSide?.toUpperCase() === "LEFT" ? "left" : "right",
          isResolved: thread.isResolved === true,
          isOutdated: thread.isOutdated === true,
          comments: thread.comments.nodes.map((comment) => ({
            id: comment.id,
            author: toActor(comment.author),
            body: comment.body ?? "",
            createdAt: comment.createdAt,
            url: trimmed(comment.url),
            reactions: toReactions(comment.reactionGroups, viewer),
          })),
        },
        commentCount: thread.comments.totalCount ?? thread.comments.nodes.length,
        nextCommentCursor: nextCursorOf(thread.comments.pageInfo),
      },
    ];
  });
  const pullRequest = decoded.success.data.repository.pullRequest;
  const avatarsByLogin = new Map<string, string>();
  const botLogins = new Set<string>();
  for (const raw of [
    pullRequest.author,
    ...(pullRequest.comments?.nodes ?? []).map((node) => node.author),
    ...(pullRequest.reviews?.nodes ?? []).map((node) => node.author),
    ...(pullRequest.reviewRequests?.nodes ?? []).map((node) => node.requestedReviewer),
    ...(pullRequest.latestReviews?.nodes ?? []).map((node) => node.author),
    ...threads.nodes.flatMap((thread) => thread.comments.nodes.map((comment) => comment.author)),
  ]) {
    const login = trimmed(raw?.login);
    const avatarUrl = trimmed(raw?.avatarUrl);
    if (login !== null && avatarUrl !== null) avatarsByLogin.set(login, avatarUrl);
    if (login !== null && toActor(raw)?.isBot) botLogins.add(login);
  }
  const reviewers = new Map<string, PullRequestActor>();
  for (const raw of [
    ...(pullRequest.reviewRequests?.nodes ?? []).map((node) => node.requestedReviewer),
    ...(pullRequest.latestReviews?.nodes ?? []).map((node) => node.author),
  ]) {
    const actor = toActor(raw);
    if (actor !== null && !reviewers.has(actor.login)) reviewers.set(actor.login, actor);
  }
  const commitStats = new Map<string, { readonly additions: number; readonly deletions: number }>();
  const commits: PullRequestCommit[] = [];
  for (const node of pullRequest.commits?.nodes ?? []) {
    const commit = node.commit;
    const oid = trimmed(commit.oid);
    if (oid === null) continue;
    if (
      (commit.parents?.totalCount ?? 1) <= 1 &&
      commit.additions !== undefined &&
      commit.deletions !== undefined
    ) {
      commitStats.set(oid, {
        additions: Math.max(0, commit.additions),
        deletions: Math.max(0, commit.deletions),
      });
    }
    const committedDate = trimmed(commit.committedDate);
    if (committedDate === null) continue;
    commits.push({
      oid,
      messageHeadline: commit.messageHeadline ?? "",
      committedDate,
      authors: (commit.authors?.nodes ?? []).flatMap((author) => {
        const actor = toGraphqlCommitActor(author);
        return actor === null ? [] : [actor];
      }),
    });
  }
  const reactionsById = new Map<string, ReadonlyArray<PullRequestReaction>>();
  for (const node of [
    ...(pullRequest.comments?.nodes ?? []),
    ...(pullRequest.reviews?.nodes ?? []),
  ]) {
    const id = trimmed(node.id);
    if (id === null) continue;
    const reactions = toReactions(node.reactionGroups, viewer);
    if (reactions.length > 0) reactionsById.set(id, reactions);
  }
  return Result.succeed({
    threads: entries,
    nextCursor: nextCursorOf(threads.pageInfo),
    reactions: toReactions(pullRequest.reactionGroups, viewer),
    reactionsById,
    reviewers: [...reviewers.values()],
    avatarsByLogin,
    botLogins,
    commitStats,
    commits,
    viewer: toPullRequestViewerFields(pullRequest),
    dismissalsByReviewId: toDismissalEntries(pullRequest.reviewDismissals?.nodes),
    nextDismissalCursor: nextCursorOf(pullRequest.reviewDismissals?.pageInfo),
  });
}

export function decodeReviewThreadCommentsJson(raw: string): Result.Result<
  {
    readonly belongsToPullRequest: boolean;
    readonly comments: ReadonlyArray<PullRequestThreadComment>;
    readonly nextCursor: string | null;
  },
  DecodeFailure
> {
  const decoded = decodeReviewThreadComments(raw);
  if (!Result.isSuccess(decoded)) {
    return Result.fail(decoded.failure);
  }
  const viewer = trimmed(decoded.success.data.viewer?.login);
  const comments = decoded.success.data.node?.comments;
  return Result.succeed({
    belongsToPullRequest:
      decoded.success.data.repository?.pullRequest?.id !== undefined &&
      decoded.success.data.repository?.pullRequest?.id ===
        decoded.success.data.node?.pullRequest?.id,
    comments: (comments?.nodes ?? []).map((comment) => ({
      id: comment.id,
      author: toActor(comment.author),
      body: comment.body ?? "",
      createdAt: comment.createdAt,
      url: trimmed(comment.url),
      reactions: toReactions(comment.reactionGroups, viewer),
    })),
    nextCursor: nextCursorOf(comments?.pageInfo),
  });
}

export interface GitHubRepositoryAccess {
  readonly mergeCapabilities: PullRequestMergeCapabilities;
  readonly canWrite: boolean;
}

function toCanWrite(viewerPermission: string | null | undefined): boolean {
  switch (viewerPermission?.trim().toUpperCase()) {
    case "ADMIN":
    case "MAINTAIN":
    case "WRITE":
      return true;
    default:
      return false;
  }
}

function toCanTriage(viewerPermission: string | null | undefined): boolean {
  return viewerPermission?.trim().toUpperCase() === "TRIAGE" || toCanWrite(viewerPermission);
}

export const BASE_COMPARISON_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!, $headRef: String!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      viewerCanUpdateBranch
      baseRef {
        compare(headRef: $headRef) {
          behindBy
        }
      }
    }
  }
}`;

const RawBaseComparisonSchema = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.NullOr(
      Schema.Struct({
        pullRequest: Schema.NullOr(
          Schema.Struct({
            viewerCanUpdateBranch: Schema.optional(Schema.NullOr(Schema.Boolean)),
            baseRef: Schema.optional(
              Schema.NullOr(
                Schema.Struct({
                  compare: Schema.optional(
                    Schema.NullOr(Schema.Struct({ behindBy: Schema.Number })),
                  ),
                }),
              ),
            ),
          }),
        ),
      }),
    ),
  }),
});

const decodeBaseComparison = decodeJsonResult(RawBaseComparisonSchema);

export interface GitHubBaseComparison {
  readonly behindBy: number | null;
  readonly viewerCanUpdate: boolean;
}

export function decodeBaseComparisonJson(
  raw: string,
): Result.Result<GitHubBaseComparison, DecodeFailure> {
  const decoded = decodeBaseComparison(raw);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  const pullRequest = decoded.success.data.repository?.pullRequest;
  const behindBy = pullRequest?.baseRef?.compare?.behindBy;
  return Result.succeed({
    behindBy: typeof behindBy === "number" && behindBy >= 0 ? behindBy : null,
    viewerCanUpdate: pullRequest?.viewerCanUpdateBranch === true,
  });
}

export const REVIEWER_CANDIDATES_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    assignableUsers(first: ${GRAPHQL_PAGE_SIZE}) {
      pageInfo { hasNextPage }
      nodes { login name avatarUrl }
    }
    pullRequest(number: $number) {
      author { login }
      reviewRequests(first: ${GRAPHQL_PAGE_SIZE}) {
        nodes {
          requestedReviewer {
            ... on User { login name avatarUrl }
            ... on Team { slug name avatarUrl }
            ... on Bot { login avatarUrl }
          }
        }
      }
    }
  }
}`;

const RawRequestedReviewerSchema = Schema.Struct({
  ...RawActorSchema.fields,
  slug: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawReviewerCandidatesSchema = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.Struct({
      assignableUsers: Schema.Struct({
        pageInfo: Schema.optional(RawPageInfoSchema),
        nodes: Schema.Array(Schema.NullOr(RawActorSchema)),
      }),
      pullRequest: Schema.NullOr(
        Schema.Struct({
          author: Schema.optional(Schema.NullOr(RawActorSchema)),
          reviewRequests: Schema.optional(
            Schema.NullOr(
              Schema.Struct({
                nodes: Schema.Array(
                  Schema.Struct({
                    requestedReviewer: Schema.optional(Schema.NullOr(RawRequestedReviewerSchema)),
                  }),
                ),
              }),
            ),
          ),
        }),
      ),
    }),
  }),
});

const decodeReviewerCandidates = decodeJsonResult(RawReviewerCandidatesSchema);

export function decodeReviewerCandidatesJson(
  raw: string,
): Result.Result<PullRequestReviewerCandidateList, DecodeFailure> {
  const decoded = decodeReviewerCandidates(raw);
  if (!Result.isSuccess(decoded)) {
    return Result.fail(decoded.failure);
  }
  const repository = decoded.success.data.repository;
  const pullRequest = repository.pullRequest;
  const author = trimmed(pullRequest?.author?.login);
  const candidates = new Map<string, PullRequestReviewerCandidate>();
  for (const node of pullRequest?.reviewRequests?.nodes ?? []) {
    const raw = node.requestedReviewer;
    const slug = trimmed(raw?.slug);
    const id = slug ?? trimmed(raw?.login);
    if (id === null) continue;
    candidates.set(`${slug === null ? "user" : "team"} ${id}`, {
      id,
      kind: slug === null ? "user" : "team",
      login: id,
      name: trimmed(raw?.name),
      avatarUrl: trimmed(raw?.avatarUrl),
      isRequested: true,
    });
  }
  for (const node of repository.assignableUsers.nodes) {
    const login = trimmed(node?.login);
    if (login === null || login === author || candidates.has(`user ${login}`)) continue;
    candidates.set(`user ${login}`, {
      id: login,
      kind: "user",
      login,
      name: trimmed(node?.name),
      avatarUrl: trimmed(node?.avatarUrl),
      isRequested: false,
    });
  }
  return Result.succeed({
    candidates: [...candidates.values()],
    truncated: repository.assignableUsers.pageInfo?.hasNextPage === true,
  });
}

const ReviewerRequestSchema = Schema.Struct({
  reviewers: Schema.Array(Schema.String),
  team_reviewers: Schema.Array(Schema.String),
});

const encodeReviewerRequest = Schema.encodeSync(Schema.fromJsonString(ReviewerRequestSchema));

export function buildReviewerRequestJson(
  reviewers: ReadonlyArray<{ readonly id: string; readonly kind: PullRequestReviewerKind }>,
): string {
  return encodeReviewerRequest({
    reviewers: reviewers.flatMap((reviewer) => (reviewer.kind === "user" ? [reviewer.id] : [])),
    team_reviewers: reviewers.flatMap((reviewer) =>
      reviewer.kind === "team" ? [reviewer.id] : [],
    ),
  });
}

export const LABEL_CANDIDATES_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    labels(first: ${GRAPHQL_PAGE_SIZE}, orderBy: { field: NAME, direction: ASC }) {
      pageInfo { hasNextPage }
      nodes { name color description }
    }
    pullRequest(number: $number) {
      labels(first: ${GRAPHQL_PAGE_SIZE}) { nodes { name } }
    }
  }
}`;

const RawLabelCandidatesSchema = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.Struct({
      labels: Schema.optional(
        Schema.NullOr(
          Schema.Struct({
            pageInfo: Schema.optional(RawPageInfoSchema),
            nodes: Schema.Array(
              Schema.NullOr(
                Schema.Struct({
                  ...RawLabelSchema.fields,
                  description: Schema.optional(Schema.NullOr(Schema.String)),
                }),
              ),
            ),
          }),
        ),
      ),
      pullRequest: Schema.NullOr(
        Schema.Struct({
          labels: Schema.optional(
            Schema.NullOr(Schema.Struct({ nodes: Schema.Array(Schema.NullOr(RawLabelSchema)) })),
          ),
        }),
      ),
    }),
  }),
});

const decodeLabelCandidates = decodeJsonResult(RawLabelCandidatesSchema);

export function decodeLabelCandidatesJson(
  raw: string,
): Result.Result<PullRequestLabelCandidateList, DecodeFailure> {
  const decoded = decodeLabelCandidates(raw);
  if (!Result.isSuccess(decoded)) {
    return Result.fail(decoded.failure);
  }
  const repository = decoded.success.data.repository;
  const applied = new Set(
    (repository.pullRequest?.labels?.nodes ?? []).flatMap((label) => {
      const name = trimmed(label?.name);
      return name === null ? [] : [name];
    }),
  );
  const candidates = new Map<string, PullRequestLabelCandidate>();
  for (const node of repository.labels?.nodes ?? []) {
    const name = trimmed(node?.name);
    if (name === null) continue;
    candidates.set(name, {
      name,
      color: trimmed(node?.color),
      description: trimmed(node?.description),
      isApplied: applied.has(name),
    });
  }
  const missing = [...applied].filter((name) => !candidates.has(name));
  return Result.succeed({
    candidates: [
      ...missing.map((name) => ({ name, color: null, description: null, isApplied: true })),
      ...candidates.values(),
    ],
    truncated: repository.labels?.pageInfo?.hasNextPage === true,
  });
}

const LabelRequestSchema = Schema.Struct({ labels: Schema.Array(Schema.String) });

const encodeLabelRequest = Schema.encodeSync(Schema.fromJsonString(LabelRequestSchema));

export function buildLabelRequestJson(labels: ReadonlyArray<string>): string {
  return encodeLabelRequest({ labels });
}

export interface GitHubViewerAccess {
  readonly canWrite: boolean;
  readonly canTriage: boolean;
  readonly canUpdate: boolean;
  readonly didAuthor: boolean;
  readonly canUpdateBranch?: boolean;
}

export const VIEWER_PERMISSIONS_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed viewerPermission
    pullRequest(number: $number) { viewerCanUpdate viewerDidAuthor }
  }
}`;

const RawViewerPermissionsSchema = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.Struct({
      ...RawRepositoryAccessSchema.fields,
      pullRequest: Schema.NullOr(RawViewerFieldsSchema),
    }),
  }),
});

const decodeViewerPermissions = decodeJsonResult(RawViewerPermissionsSchema);

export function decodeViewerPermissionsJson(
  raw: string,
): Result.Result<GitHubViewerAccess & GitHubRepositoryAccess, DecodeFailure> {
  const decoded = decodeViewerPermissions(raw);
  if (!Result.isSuccess(decoded)) {
    return Result.fail(decoded.failure);
  }
  const repository = decoded.success.data.repository;
  return Result.succeed({
    mergeCapabilities: {
      merge: repository.mergeCommitAllowed,
      squash: repository.squashMergeAllowed,
      rebase: repository.rebaseMergeAllowed,
    },
    canWrite: toCanWrite(repository.viewerPermission),
    canTriage: toCanTriage(repository.viewerPermission),
    ...toPullRequestViewerFields(repository.pullRequest),
  });
}

export interface GitHubPullRequestFilesPatch {
  readonly patch: string;
  readonly truncated: boolean;
  readonly rawCount: number;
  readonly omittedFileStats: ReadonlyArray<PullRequestOmittedFileStat>;
}

export function decodePullRequestFilesJson(
  raw: string,
): Result.Result<GitHubPullRequestFilesPatch, DecodeFailure> {
  const decoded = decodeUnknownList(raw);
  if (!Result.isSuccess(decoded)) {
    return Result.fail(decoded.failure);
  }
  const sections: string[] = [];
  const omittedFileStats: PullRequestOmittedFileStat[] = [];
  let truncated = false;
  for (const entry of decoded.success) {
    const file = decodeFileEntry(entry);
    if (Exit.isFailure(file)) continue;
    const value = file.value;
    const hunks = value.patch ?? "";
    const status = value.status?.trim().toLowerCase();
    if (hunks.length === 0) {
      const additions = value.additions ?? 0;
      const deletions = value.deletions ?? 0;
      if (additions + deletions > 0) {
        truncated = true;
        omittedFileStats.push({ path: value.filename, additions, deletions });
      }
    }
    const oldPath =
      status === "renamed" ? value.previous_filename || value.filename : value.filename;
    const header = [
      `diff --git ${quoteGitPatchPath(`a/${oldPath}`)} ${quoteGitPatchPath(`b/${value.filename}`)}`,
      ...(status === "added" ? ["new file mode 100644"] : []),
      ...(status === "removed" ? ["deleted file mode 100644"] : []),
      ...(status === "renamed"
        ? [
            `rename from ${quoteGitPatchPath(oldPath)}`,
            `rename to ${quoteGitPatchPath(value.filename)}`,
          ]
        : []),
      `--- ${status === "added" ? "/dev/null" : quoteGitPatchPath(`a/${oldPath}`)}`,
      `+++ ${status === "removed" ? "/dev/null" : quoteGitPatchPath(`b/${value.filename}`)}`,
    ].join("\n");
    sections.push(hunks.length === 0 ? `${header}\n` : `${header}\n${hunks.replace(/\n?$/, "\n")}`);
  }
  return Result.succeed({
    patch: sections.join(""),
    truncated,
    rawCount: decoded.success.length,
    omittedFileStats,
  });
}

export const PULL_REQUEST_FILES_VIEWED_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      files(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { path viewerViewedState }
      }
    }
  }
}`;

const RawPullRequestFilesViewedSchema = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.NullOr(
      Schema.Struct({
        pullRequest: Schema.NullOr(
          Schema.Struct({
            files: Schema.Struct({
              pageInfo: Schema.Struct({
                hasNextPage: Schema.Boolean,
                endCursor: Schema.NullOr(Schema.String),
              }),
              nodes: Schema.NullOr(
                Schema.Array(
                  Schema.NullOr(
                    Schema.Struct({
                      path: Schema.String,
                      viewerViewedState: Schema.String,
                    }),
                  ),
                ),
              ),
            }),
          }),
        ),
      }),
    ),
  }),
});

const decodePullRequestFilesViewed = decodeJsonResult(RawPullRequestFilesViewedSchema);

export interface GitHubPullRequestFilesViewedPage {
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly state: PullRequestFileViewedState;
  }>;
  readonly nextCursor: string | null;
}

function toFileViewedState(raw: string): PullRequestFileViewedState {
  switch (raw.trim().toUpperCase()) {
    case "VIEWED":
      return "viewed";
    case "DISMISSED":
      return "dismissed";
    default:
      return "unviewed";
  }
}

export function decodePullRequestFilesViewedJson(
  raw: string,
): Result.Result<GitHubPullRequestFilesViewedPage, DecodeFailure> {
  const decoded = decodePullRequestFilesViewed(raw);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  const files = decoded.success.data.repository?.pullRequest?.files;
  if (files === undefined) return Result.succeed({ files: [], nextCursor: null });
  return Result.succeed({
    files: (files.nodes ?? []).flatMap((node) =>
      node === null || node.path.length === 0
        ? []
        : [{ path: node.path, state: toFileViewedState(node.viewerViewedState) }],
    ),
    nextCursor: files.pageInfo.hasNextPage ? files.pageInfo.endCursor : null,
  });
}

export function buildSetFilesViewedGraphQlMutation(
  files: ReadonlyArray<{ readonly path: string; readonly viewed: boolean }>,
): { readonly query: string; readonly variables: Readonly<Record<string, string>> } | null {
  if (files.length === 0) return null;
  const parameters = files.map((_, index) => `$path${index}: String!`).join(", ");
  const fields = files
    .map(
      (file, index) =>
        `  f${index}: ${file.viewed ? "markFileAsViewed" : "unmarkFileAsViewed"}(input: { pullRequestId: $pullRequestId, path: $path${index} }) { clientMutationId }`,
    )
    .join("\n");
  return {
    query: `mutation($pullRequestId: ID!, ${parameters}) {\n${fields}\n}`,
    variables: Object.fromEntries(files.map((file, index) => [`path${index}`, file.path])),
  };
}

const RawStackPullRequestSchema = Schema.Struct({
  title: Schema.optional(Schema.String),
  draft: Schema.optional(Schema.Boolean),
  number: Schema.Int,
  head: Schema.Struct({ ref: Schema.String, sha: Schema.optional(Schema.String) }),
  state: Schema.optional(Schema.NullOr(Schema.String)),
  merged_at: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawStackSchema = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.Union([Schema.Int, Schema.String]))),
  number: Schema.Int,
  node_id: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.String,
  html_url: Schema.optional(Schema.NullOr(Schema.String)),
  base: Schema.Union([Schema.String, Schema.Struct({ ref: Schema.String })]),
  pull_requests: Schema.Array(RawStackPullRequestSchema),
});

const decodeStacks = decodeJsonResult(Schema.Array(RawStackSchema));

export interface GitHubPullRequestStackLayer {
  readonly title?: string;
  readonly isDraft?: boolean;
  readonly headSha?: string;
  readonly number: number;
  readonly headBranch: string;
  readonly state: PullRequestState;
}

export interface GitHubPullRequestStack {
  readonly id: string;
  readonly number: number;
  readonly url: string;
  readonly base: string;
  readonly layers: ReadonlyArray<GitHubPullRequestStackLayer>;
}

export function decodePullRequestStacksJson(
  raw: string,
): Result.Result<GitHubPullRequestStack | null, DecodeFailure> {
  const decoded = decodeStacks(raw);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  const stack = decoded.success[0];
  if (stack === undefined) return Result.succeed(null);
  return Result.succeed({
    id: stack.id == null ? (trimmed(stack.node_id) ?? String(stack.number)) : String(stack.id),
    number: stack.number,
    url: trimmed(stack.html_url) ?? stack.url,
    base: typeof stack.base === "string" ? stack.base : stack.base.ref,
    layers: stack.pull_requests.map((pullRequest) => ({
      ...(pullRequest.title === undefined ? {} : { title: pullRequest.title }),
      ...(pullRequest.draft === undefined ? {} : { isDraft: pullRequest.draft }),
      ...(pullRequest.head.sha === undefined ? {} : { headSha: pullRequest.head.sha }),
      number: pullRequest.number,
      headBranch: pullRequest.head.ref,
      state: toState({ state: pullRequest.state, mergedAt: pullRequest.merged_at }),
    })),
  });
}

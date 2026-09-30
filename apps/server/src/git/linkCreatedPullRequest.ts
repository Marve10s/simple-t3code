import { sourceControlRepositorySelector } from "@t3tools/shared/sourceControl";
import {
  type CommandId,
  pullRequestHostOf,
  type GitRunStackedActionResult,
  type OrchestrationProjectShell,
  type SourceControlProviderKind,
  type ThreadId,
} from "@t3tools/contracts";
import { parseChangeRequestUrl } from "@t3tools/shared/changeRequestUrl";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as OrchestrationEngine from "../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";

export interface CreatedPullRequestKey {
  readonly host: string;
  readonly repository: string;
  readonly number: number;
  readonly url: string;
}

export function createdPullRequestKey(
  result: Pick<GitRunStackedActionResult, "pr">,
  project: OrchestrationProjectShell | undefined,
): CreatedPullRequestKey | null {
  const { status, number, url } = result.pr;
  if ((status !== "created" && status !== "opened_existing") || number === undefined || !url) {
    return null;
  }
  const parsed = parseChangeRequestUrl(url);
  if (parsed !== null) return { ...parsed, url };
  const identity = project?.repositoryIdentity;
  const kind = identity?.provider as SourceControlProviderKind | undefined;
  const repository = sourceControlRepositorySelector(identity);
  if (!identity || kind === undefined || repository === null) return null;
  return {
    host: pullRequestHostOf(identity, kind),
    repository: repository.toLowerCase(),
    number,
    url,
  };
}

export const linkCreatedPullRequest = <E>(input: {
  readonly threadId: ThreadId;
  readonly result: Pick<GitRunStackedActionResult, "pr">;
  readonly commandId: Effect.Effect<CommandId, E>;
}): Effect.Effect<
  void,
  never,
  OrchestrationEngine.OrchestrationEngineService | ProjectionSnapshotQuery.ProjectionSnapshotQuery
> =>
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngine.OrchestrationEngineService;
    const snapshots = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
    const thread = yield* snapshots.getThreadShellById(input.threadId);
    if (Option.isNone(thread)) return;
    const project = Option.getOrUndefined(
      yield* snapshots.getProjectShellById(thread.value.projectId),
    );
    const key = createdPullRequestKey(input.result, project);
    if (key === null) return;
    const commandId = yield* input.commandId;
    yield* engine
      .dispatch({
        type: "thread.pull-request.link",
        commandId,
        threadId: input.threadId,
        ...key,
        source: "created",
      })
      .pipe(Effect.catchTags({ OrchestrationCommandInvariantError: () => Effect.void }));
  }).pipe(
    Effect.withSpan("linkCreatedPullRequest"),
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause as Cause.Cause<never>)
        : Effect.logWarning("failed to link created pull request to thread", {
            threadId: input.threadId,
          }),
    ),
  );

import { pipe } from "effect/Function";
import * as Arr from "effect/Array";
import * as O from "effect/Order";
import type {
  MessageId,
  OrchestrationCheckpointSummary,
  OrchestrationEvent,
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationSession,
  OrchestrationThread,
  OrchestrationThreadActivity,
  ThreadPullRequestLink,
  TurnId,
} from "@t3tools/contracts";
import { threadPullRequestKeysEqual } from "@t3tools/shared/threadPullRequests";
import { isImportedAgentSessionMessageId } from "@t3tools/contracts";
import { compareDateTimeStrings } from "@t3tools/shared/dateTime";

export type ThreadDetailReducerResult =
  | { readonly kind: "updated"; readonly thread: OrchestrationThread }
  | { readonly kind: "deleted" }
  | { readonly kind: "unchanged" };

function withPullRequests(
  thread: OrchestrationThread,
  pullRequests: ReadonlyArray<ThreadPullRequestLink>,
  updatedAt: string,
): ThreadDetailReducerResult {
  return {
    kind: "updated",
    thread: {
      ...thread,
      pullRequests,
      linkedPullRequest:
        thread.linkedPullRequest &&
        pullRequests.some(
          (link) => link.source !== "stack-dismissed" && link.url === thread.linkedPullRequest?.url,
        )
          ? thread.linkedPullRequest
          : null,
      updatedAt,
    },
  };
}

const proposedPlanOrder = O.combine<OrchestrationThread["proposedPlans"][number]>(
  O.mapInput(O.String, (p) => p.createdAt),
  O.mapInput(O.String, (p) => p.id),
);

const checkpointOrder = O.mapInput(
  O.Number,
  (cp: OrchestrationThread["checkpoints"][number]) =>
    cp.checkpointTurnCount ?? Number.MAX_SAFE_INTEGER,
);

const activityOrder = O.combineAll<OrchestrationThreadActivity>([
  O.mapInput(O.Number, (a) => a.sequence ?? Number.MAX_SAFE_INTEGER),
  O.mapInput(O.String, (a) => a.createdAt),
  O.mapInput(O.String, (a) => a.id),
]);

const activityIdIndex = new WeakMap<
  ReadonlyArray<OrchestrationThreadActivity>,
  Set<OrchestrationThreadActivity["id"]>
>();

function isResolvableContextWindowActivity(activity: OrchestrationThreadActivity): boolean {
  if (activity.kind !== "context-window.updated") {
    return false;
  }
  const payload =
    activity.payload && typeof activity.payload === "object"
      ? (activity.payload as Record<string, unknown>)
      : null;
  const usedTokens = payload?.usedTokens;
  return typeof usedTokens === "number" && Number.isFinite(usedTokens) && usedTokens >= 0;
}

export function applyThreadDetailEvent(
  thread: OrchestrationThread,
  event: OrchestrationEvent,
): ThreadDetailReducerResult {
  switch (event.type) {
    case "project.created":
    case "project.meta-updated":
    case "project.deleted":
      return { kind: "unchanged" };

    case "thread.created":
      return {
        kind: "updated",
        thread: {
          id: event.payload.threadId,
          projectId: event.payload.projectId,
          title: event.payload.title,
          modelSelection: event.payload.modelSelection,
          runtimeMode: event.payload.runtimeMode,
          interactionMode: event.payload.interactionMode,
          branch: event.payload.branch,
          worktreePath: event.payload.worktreePath,
          branchPullRequest: null,
          latestTurn: null,
          createdAt: event.payload.createdAt,
          updatedAt: event.payload.updatedAt,
          archivedAt: null,
          settledOverride: null,
          settledAt: null,
          unsettledAt: null,
          activeOrderKey: null,
          autoSettleDisabledAt: null,
          snoozedUntil: null,
          snoozedAt: null,
          deletedAt: null,
          pullRequests: [],
          messages: [],
          proposedPlans: [],
          activities: [],
          checkpoints: [],
          session: null,
        },
      };

    case "thread.deleted":
      return { kind: "deleted" };

    case "thread.archived":
      return {
        kind: "updated",
        thread: {
          ...thread,
          archivedAt: event.payload.archivedAt,
          titleRegeneration: null,
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.unarchived":
      return {
        kind: "updated",
        thread: { ...thread, archivedAt: null, updatedAt: event.payload.updatedAt },
      };

    case "thread.settled":
      return {
        kind: "updated",
        thread: {
          ...thread,
          settledOverride: "settled",
          settledAt: event.payload.settledAt,
          unsettledAt: null,
          activeOrderKey: null,
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.unsettled":
      return {
        kind: "updated",
        thread: {
          ...thread,
          settledOverride: event.payload.reason === "user" ? "active" : null,
          settledAt: null,
          unsettledAt:
            thread.settledOverride === "active"
              ? (thread.unsettledAt ?? null)
              : event.payload.updatedAt,
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.snoozed":
      return {
        kind: "updated",
        thread: {
          ...thread,
          snoozedUntil: event.payload.snoozedUntil,
          snoozedAt: event.payload.snoozedAt,
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.unsnoozed":
      return {
        kind: "updated",
        thread: {
          ...thread,
          snoozedUntil: null,
          snoozedAt: null,
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.pinned":
      return {
        kind: "updated",
        thread: {
          ...thread,
          pinnedAt: event.payload.pinnedAt,
          ...(event.payload.pinOrderKey !== undefined
            ? { pinOrderKey: event.payload.pinOrderKey }
            : {}),
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.unpinned":
      return {
        kind: "updated",
        thread: {
          ...thread,
          pinnedAt: null,
          pinOrderKey: null,
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.pin-reordered":
      return {
        kind: "updated",
        thread: {
          ...thread,
          pinOrderKey: event.payload.orderKey,
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.auto-settle-set":
      return {
        kind: "updated",
        thread: {
          ...thread,
          autoSettleDisabledAt: event.payload.autoSettleDisabledAt,
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.meta-updated":
      return {
        kind: "updated",
        thread: {
          ...thread,
          ...(event.payload.title !== undefined ? { title: event.payload.title } : {}),
          ...(event.payload.titleState !== undefined
            ? { titleState: event.payload.titleState }
            : {}),
          ...(event.payload.titleRegeneration !== undefined
            ? { titleRegeneration: event.payload.titleRegeneration }
            : {}),
          ...(event.payload.modelSelection !== undefined
            ? { modelSelection: event.payload.modelSelection }
            : {}),
          ...(event.payload.branch !== undefined ? { branch: event.payload.branch } : {}),
          ...(event.payload.worktreePath !== undefined
            ? { worktreePath: event.payload.worktreePath }
            : {}),
          ...(event.payload.linkedPullRequest !== undefined
            ? { linkedPullRequest: event.payload.linkedPullRequest }
            : {}),
          ...(event.payload.branchPullRequest !== undefined
            ? { branchPullRequest: event.payload.branchPullRequest }
            : {}),
          ...(event.payload.activeOrderKey !== undefined
            ? { activeOrderKey: event.payload.activeOrderKey }
            : {}),
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.pull-request-linked": {
      const link = event.payload.link;
      const others = thread.pullRequests.filter(
        (existing) => !threadPullRequestKeysEqual(existing, link),
      );
      return withPullRequests(thread, [...others, link], event.payload.updatedAt);
    }

    case "thread.pull-request-unlinked":
      return withPullRequests(
        thread,
        thread.pullRequests.filter(
          (existing) => !threadPullRequestKeysEqual(existing, event.payload),
        ),
        event.payload.updatedAt,
      );

    case "thread.pull-request-synced": {
      if (
        !thread.pullRequests.some((existing) => threadPullRequestKeysEqual(existing, event.payload))
      ) {
        return { kind: "unchanged" };
      }
      return withPullRequests(
        thread,
        thread.pullRequests.map((existing) =>
          threadPullRequestKeysEqual(existing, event.payload)
            ? { ...existing, snapshot: event.payload.snapshot, stack: event.payload.stack }
            : existing,
        ),
        event.payload.updatedAt,
      );
    }

    case "thread.runtime-mode-set":
      return {
        kind: "updated",
        thread: {
          ...thread,
          runtimeMode: event.payload.runtimeMode,
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.interaction-mode-set":
      return {
        kind: "updated",
        thread: {
          ...thread,
          interactionMode: event.payload.interactionMode,
          updatedAt: event.payload.updatedAt,
        },
      };

    case "thread.turn-start-requested":
      return {
        kind: "updated",
        thread: {
          ...thread,
          ...(event.payload.modelSelection !== undefined
            ? { modelSelection: event.payload.modelSelection }
            : {}),
          runtimeMode: event.payload.runtimeMode,
          interactionMode: event.payload.interactionMode,
          updatedAt: event.occurredAt,
        },
      };

    case "thread.turn-interrupt-requested": {
      if (event.payload.turnId === undefined) {
        return { kind: "unchanged" };
      }
      const latestTurn = thread.latestTurn;
      if (latestTurn === null || latestTurn.turnId !== event.payload.turnId) {
        return { kind: "unchanged" };
      }
      return {
        kind: "updated",
        thread: {
          ...thread,
          latestTurn: {
            ...latestTurn,
            state: "interrupted",
            startedAt: latestTurn.startedAt ?? event.payload.createdAt,
            completedAt: latestTurn.completedAt ?? event.payload.createdAt,
          },
          updatedAt: event.occurredAt,
        },
      };
    }

    case "thread.message-sent": {
      const message: OrchestrationMessage = {
        id: event.payload.messageId,
        role: event.payload.role,
        text: event.payload.text,
        ...(event.payload.attachments !== undefined
          ? { attachments: event.payload.attachments }
          : {}),
        ...(event.payload.context !== undefined ? { context: event.payload.context } : {}),
        turnId: event.payload.turnId,
        streaming: event.payload.streaming,
        createdAt: event.payload.createdAt,
        updatedAt: event.payload.updatedAt,
      };

      let found = false;
      const messages = thread.messages.map((entry) => {
        if (entry.id !== message.id) return entry;
        found = true;
        return {
          ...entry,
          text: message.streaming
            ? `${entry.text}${message.text}`
            : message.text.length > 0
              ? message.text
              : entry.text,
          streaming: message.streaming,
          ...(message.turnId !== undefined ? { turnId: message.turnId } : {}),
          ...(message.streaming ? {} : { updatedAt: message.updatedAt }),
          ...(message.attachments !== undefined ? { attachments: message.attachments } : {}),
          ...(message.context !== undefined ? { context: message.context } : {}),
        };
      });
      if (!found) messages.push(message);
      const turnStillRunning =
        event.payload.turnId !== null &&
        thread.session?.status === "running" &&
        thread.session.activeTurnId === event.payload.turnId;
      const settlesTurn = !event.payload.streaming && !turnStillRunning;
      const latestTurn = reuseLatestTurn(
        thread.latestTurn,
        event.payload.role === "assistant" &&
          event.payload.turnId !== null &&
          (thread.latestTurn === null || thread.latestTurn.turnId === event.payload.turnId)
          ? {
              turnId: event.payload.turnId,
              state: settlesTurn
                ? thread.latestTurn?.state === "interrupted"
                  ? "interrupted"
                  : thread.latestTurn?.state === "error"
                    ? "error"
                    : "completed"
                : "running",
              requestedAt:
                thread.latestTurn?.turnId === event.payload.turnId
                  ? thread.latestTurn.requestedAt
                  : event.payload.createdAt,
              startedAt:
                thread.latestTurn?.turnId === event.payload.turnId
                  ? (thread.latestTurn.startedAt ?? event.payload.createdAt)
                  : event.payload.createdAt,
              completedAt: settlesTurn
                ? event.payload.updatedAt
                : thread.latestTurn?.turnId === event.payload.turnId
                  ? (thread.latestTurn.completedAt ?? null)
                  : null,
              assistantMessageId: event.payload.messageId,
            }
          : thread.latestTurn,
      );

      const checkpoints =
        event.payload.role === "assistant" && event.payload.turnId !== null
          ? rebindCheckpointAssistantMessage(
              thread.checkpoints,
              event.payload.turnId,
              event.payload.messageId,
            )
          : thread.checkpoints;

      return {
        kind: "updated",
        thread: {
          ...thread,
          messages,
          checkpoints,
          latestTurn,
          updatedAt: event.occurredAt,
        },
      };
    }

    case "thread.session-set": {
      const settledTurnState = settledTurnStateForSessionStatus(event.payload.session.status);
      const latestTurn = reuseLatestTurn(
        thread.latestTurn,
        event.payload.session.status === "running" && event.payload.session.activeTurnId !== null
          ? {
              turnId: event.payload.session.activeTurnId,
              state: "running",
              requestedAt:
                thread.latestTurn?.turnId === event.payload.session.activeTurnId
                  ? thread.latestTurn.requestedAt
                  : event.payload.session.updatedAt,
              startedAt:
                thread.latestTurn?.turnId === event.payload.session.activeTurnId
                  ? (thread.latestTurn.startedAt ?? event.payload.session.updatedAt)
                  : event.payload.session.updatedAt,
              completedAt: null,
              assistantMessageId:
                thread.latestTurn?.turnId === event.payload.session.activeTurnId
                  ? thread.latestTurn.assistantMessageId
                  : null,
            }
          : thread.latestTurn !== null &&
              thread.latestTurn.state === "running" &&
              settledTurnState !== null
            ? {
                ...thread.latestTurn,
                state: settledTurnState,
                completedAt: event.payload.session.updatedAt,
              }
            : thread.latestTurn,
      );

      return {
        kind: "updated",
        thread: {
          ...thread,
          session: event.payload.session,
          latestTurn,
          updatedAt: event.occurredAt,
        },
      };
    }

    case "thread.session-stop-requested":
      return thread.session === null
        ? { kind: "unchanged" }
        : {
            kind: "updated",
            thread: {
              ...thread,
              session: {
                ...thread.session,
                status: "stopped",
                activeTurnId: null,
                updatedAt: event.payload.createdAt,
              },
              updatedAt: event.occurredAt,
            },
          };

    case "thread.proposed-plan-upserted": {
      const proposedPlan = event.payload.proposedPlan;

      const proposedPlans = pipe(
        thread.proposedPlans,
        Arr.filter((entry) => entry.id !== proposedPlan.id),
        Arr.append(proposedPlan),
        Arr.sort(proposedPlanOrder),
      );

      return {
        kind: "updated",
        thread: { ...thread, proposedPlans, updatedAt: event.occurredAt },
      };
    }

    case "thread.turn-diff-completed": {
      const checkpoint: OrchestrationCheckpointSummary = {
        turnId: event.payload.turnId,
        checkpointTurnCount: event.payload.checkpointTurnCount,
        checkpointRef: event.payload.checkpointRef,
        status: event.payload.status,
        files: event.payload.files,
        assistantMessageId: event.payload.assistantMessageId,
        completedAt: event.payload.completedAt,
      };

      const existing = thread.checkpoints.find((entry) => entry.turnId === checkpoint.turnId);
      if (existing && existing.status !== "missing" && checkpoint.status === "missing") {
        return { kind: "unchanged" };
      }

      const checkpoints = pipe(
        thread.checkpoints,
        Arr.filter((entry) => entry.turnId !== checkpoint.turnId),
        Arr.append(checkpoint),
        Arr.sort(checkpointOrder),
      );

      const diffTurnStillRunning =
        thread.session?.status === "running" &&
        thread.session.activeTurnId === event.payload.turnId;
      const latestTurn =
        !diffTurnStillRunning &&
        (thread.latestTurn === null || thread.latestTurn.turnId === event.payload.turnId)
          ? {
              turnId: event.payload.turnId,
              state:
                thread.latestTurn?.state === "interrupted"
                  ? "interrupted"
                  : checkpointStatusToTurnState(event.payload.status),
              requestedAt: thread.latestTurn?.requestedAt ?? event.payload.completedAt,
              startedAt: thread.latestTurn?.startedAt ?? event.payload.completedAt,
              completedAt: event.payload.completedAt,
              assistantMessageId: event.payload.assistantMessageId,
            }
          : thread.latestTurn;

      return {
        kind: "updated",
        thread: { ...thread, checkpoints, latestTurn, updatedAt: event.occurredAt },
      };
    }

    case "thread.reverted": {
      const checkpoints = pipe(
        thread.checkpoints,
        Arr.filter(
          (entry) =>
            entry.checkpointTurnCount !== undefined &&
            entry.checkpointTurnCount <= event.payload.turnCount,
        ),
        Arr.sort(checkpointOrder),
      );

      const retainedTurnIds = new Set(Arr.map(checkpoints, (entry) => entry.turnId));
      const messages = retainMessagesAfterRevert(
        thread.messages,
        retainedTurnIds,
        event.payload.turnCount,
      );
      const proposedPlans = pipe(
        thread.proposedPlans,
        Arr.filter((plan) => plan.turnId === null || retainedTurnIds.has(plan.turnId)),
      );
      const activities = pipe(
        thread.activities,
        Arr.filter((activity) => activity.turnId === null || retainedTurnIds.has(activity.turnId)),
      );
      const latestCheckpoint = checkpoints.at(-1) ?? null;

      return {
        kind: "updated",
        thread: {
          ...thread,
          checkpoints,
          messages,
          proposedPlans,
          activities,
          latestTurn:
            latestCheckpoint === null
              ? null
              : {
                  turnId: latestCheckpoint.turnId,
                  state: checkpointStatusToTurnState(
                    latestCheckpoint.status as "ready" | "missing" | "error",
                  ),
                  requestedAt: latestCheckpoint.completedAt,
                  startedAt: latestCheckpoint.completedAt,
                  completedAt: latestCheckpoint.completedAt,
                  assistantMessageId: latestCheckpoint.assistantMessageId ?? null,
                },
          updatedAt: event.occurredAt,
        },
      };
    }

    case "thread.activity-appended": {
      const activity = event.payload.activity;
      const supersedesContextWindow = isResolvableContextWindowActivity(activity);
      const ids = activityIdIndex.get(thread.activities);
      const lastActivity = thread.activities.at(-1);
      if (
        !supersedesContextWindow &&
        ids !== undefined &&
        (lastActivity === undefined || activityOrder(lastActivity, activity) <= 0) &&
        !ids.has(activity.id)
      ) {
        const activities = Arr.append(thread.activities, activity);
        activityIdIndex.delete(thread.activities);
        ids.add(activity.id);
        activityIdIndex.set(activities, ids);
        return {
          kind: "updated",
          thread: {
            ...thread,
            activities,
            updatedAt: event.occurredAt,
          },
        };
      }
      const activities = pipe(
        thread.activities,
        Arr.filter(
          (entry) =>
            entry.id !== activity.id &&
            !(
              supersedesContextWindow &&
              entry.turnId === activity.turnId &&
              isResolvableContextWindowActivity(entry)
            ),
        ),
        Arr.append(activity),
        Arr.sort(activityOrder),
      );
      activityIdIndex.set(activities, new Set(activities.map((entry) => entry.id)));

      return {
        kind: "updated",
        thread: { ...thread, activities, updatedAt: event.occurredAt },
      };
    }

    case "thread.approval-response-requested":
    case "thread.user-input-response-requested":
    case "thread.checkpoint-revert-requested":
      return { kind: "unchanged" };
  }

  return { kind: "unchanged" };
}

function settledTurnStateForSessionStatus(
  status: OrchestrationSession["status"],
): "completed" | "interrupted" | "error" | null {
  switch (status) {
    case "idle":
    case "ready":
      return "completed";
    case "error":
      return "error";
    case "interrupted":
    case "stopped":
      return "interrupted";
    case "starting":
    case "running":
      return null;
  }
}

function checkpointStatusToTurnState(
  status: "ready" | "missing" | "error",
): OrchestrationLatestTurn["state"] {
  switch (status) {
    case "ready":
      return "completed";
    case "error":
      return "error";
    case "missing":
      return "completed";
  }
}

function reuseLatestTurn(
  previous: OrchestrationLatestTurn | null,
  next: OrchestrationLatestTurn | null,
): OrchestrationLatestTurn | null {
  if (previous === null || next === null) {
    return next;
  }
  return previous.turnId === next.turnId &&
    previous.state === next.state &&
    previous.requestedAt === next.requestedAt &&
    previous.startedAt === next.startedAt &&
    previous.completedAt === next.completedAt &&
    previous.assistantMessageId === next.assistantMessageId &&
    previous.sourceProposedPlan?.threadId === next.sourceProposedPlan?.threadId &&
    previous.sourceProposedPlan?.planId === next.sourceProposedPlan?.planId
    ? previous
    : next;
}

function rebindCheckpointAssistantMessage(
  checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>,
  turnId: TurnId,
  messageId: MessageId,
): ReadonlyArray<OrchestrationCheckpointSummary> {
  const needsRebind = checkpoints.some(
    (entry) => entry.turnId === turnId && entry.assistantMessageId !== messageId,
  );
  if (!needsRebind) {
    return checkpoints;
  }
  return Arr.map(checkpoints, (entry) =>
    entry.turnId === turnId ? { ...entry, assistantMessageId: messageId } : entry,
  );
}

function retainMessagesAfterRevert(
  messages: ReadonlyArray<OrchestrationMessage>,
  retainedTurnIds: ReadonlySet<string>,
  turnCount: number,
): OrchestrationMessage[] {
  const retainedMessageIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "system" || isImportedAgentSessionMessageId(message.id)) {
      retainedMessageIds.add(message.id);
    } else if (message.turnId !== null && retainedTurnIds.has(message.turnId)) {
      retainedMessageIds.add(message.id);
    }
  }

  for (const role of ["user", "assistant"] as const) {
    const retainedCount = messages.filter(
      (message) =>
        message.role === role &&
        !isImportedAgentSessionMessageId(message.id) &&
        retainedMessageIds.has(message.id),
    ).length;
    const missingCount = Math.max(0, turnCount - retainedCount);
    const fallbackMessages = messages
      .filter(
        (message) =>
          message.role === role &&
          !retainedMessageIds.has(message.id) &&
          (message.turnId === null || retainedTurnIds.has(message.turnId)),
      )
      .sort(
        (left, right) =>
          compareDateTimeStrings(left.createdAt, right.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, missingCount);
    for (const message of fallbackMessages) {
      retainedMessageIds.add(message.id);
    }
  }

  return Arr.filter(messages, (message) => retainedMessageIds.has(message.id));
}

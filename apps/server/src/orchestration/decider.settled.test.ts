import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationEvent,
  type OrchestrationReadModel,
  type OrchestrationSession,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { projectEvent } from "./projector.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const SETTLED_AT = "2025-12-30T00:00:00.000Z";
const SETTLE_BLOCKED_MESSAGE =
  "This thread still needs attention. Resolve or interrupt it first, then try again.";

function makeReadModel(
  settledOverride: OrchestrationThread["settledOverride"],
  archivedAt: string | null = null,
  session: OrchestrationSession | null = null,
  activities: OrchestrationThread["activities"] = [],
  messages: OrchestrationThread["messages"] = [],
  lifecycle: {
    readonly pinnedAt?: string | null;
    readonly snoozedUntil?: string | null;
    readonly snoozedAt?: string | null;
  } = {},
): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [
      {
        id: ThreadId.make("thread-1"),
        projectId: ProjectId.make("project-1"),
        title: "Thread",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        pullRequests: [],
        latestTurn: null,
        createdAt: NOW,
        updatedAt: NOW,
        archivedAt,
        settledOverride,
        settledAt: settledOverride === "settled" ? SETTLED_AT : null,
        snoozedUntil: lifecycle.snoozedUntil ?? null,
        snoozedAt: lifecycle.snoozedAt ?? (lifecycle.snoozedUntil != null ? SETTLED_AT : null),
        pinnedAt: lifecycle.pinnedAt ?? null,
        deletedAt: null,
        messages,
        proposedPlans: [],
        activities,
        checkpoints: [],
        session,
      },
    ],
    updatedAt: NOW,
  };
}

function makeSession(status: OrchestrationSession["status"]): OrchestrationSession {
  return {
    threadId: ThreadId.make("thread-1"),
    status,
    providerName: "Codex",
    runtimeMode: "full-access",
    activeTurnId: null,
    lastError: null,
    updatedAt: NOW,
  };
}

it.layer(NodeServices.layer)("settled thread decider", (it) => {
  it.effect("preserves the activity stamp when automatically settling", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.auto-settle",
          commandId: CommandId.make("cmd-auto-settle-inactive"),
          threadId: ThreadId.make("thread-1"),
          snapshotSequence: 0,
          settledAt: SETTLED_AT,
        },
        readModel: makeReadModel(null),
      });
      const events = Array.isArray(result) ? result : [result];
      const settled = events.find((event) => event.type === "thread.settled");
      expect(settled?.payload.settledAt).toBe(SETTLED_AT);
      expect(settled?.payload.updatedAt).toBe(settled?.occurredAt);
      expect(settled?.payload.updatedAt).not.toBe(SETTLED_AT);
    }),
  );

  it.effect("rejects an automatic settle when the thread is pinned active", () =>
    Effect.gen(function* () {
      const command = {
        type: "thread.auto-settle" as const,
        commandId: CommandId.make("cmd-auto-settle"),
        threadId: ThreadId.make("thread-1"),
        snapshotSequence: 0,
        settledAt: SETTLED_AT,
      };
      const pinnedActive = yield* decideOrchestrationCommand({
        command,
        readModel: makeReadModel("active"),
      }).pipe(Effect.flip);
      expect(pinnedActive._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("settles awake threads without a redundant wake and re-emits idempotently", () =>
    Effect.gen(function* () {
      const event = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null),
      });
      const events = Array.isArray(event) ? event : [event];
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("thread.settled");
      if (events[0]?.type === "thread.settled") {
        expect(events[0].payload.settledAt).toBe(events[0].payload.updatedAt);
      }

      const reEmit = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-again"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel("settled"),
      });
      const reEmitEvents = Array.isArray(reEmit) ? reEmit : [reEmit];
      expect(reEmitEvents).toHaveLength(1);
      expect(reEmitEvents[0]?.type).toBe("thread.settled");
      if (reEmitEvents[0]?.type === "thread.settled") {
        expect(reEmitEvents[0].payload.settledAt).toBe(SETTLED_AT);
        expect(reEmitEvents[0].payload.updatedAt).not.toBe(SETTLED_AT);
      }
    }),
  );

  it.effect("settling a snoozed thread also wakes it", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-snoozed"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null, null, null, [], [], {
          snoozedUntil: "1970-01-02T09:00:00.000Z",
        }),
      });
      const events = Array.isArray(result) ? result : [result];
      expect(events.map((entry) => entry.type)).toEqual(["thread.settled", "thread.unsnoozed"]);
      const settled = events.find((entry) => entry.type === "thread.settled");
      const unsnoozed = events.find((entry) => entry.type === "thread.unsnoozed");
      if (settled?.type === "thread.settled" && unsnoozed?.type === "thread.unsnoozed") {
        expect(unsnoozed.payload.reason).toBe("user");
        expect(unsnoozed.payload.updatedAt).toBe(settled.payload.updatedAt);
      }
    }),
  );

  it.effect("repeated settle repairs legacy settled and snoozed state", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-snoozed-again"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel("settled", null, null, [], [], {
          snoozedUntil: "1970-01-02T09:00:00.000Z",
        }),
      });
      const events = Array.isArray(result) ? result : [result];
      expect(events.map((entry) => entry.type)).toEqual(["thread.settled", "thread.unsnoozed"]);
      const settled = events.find((entry) => entry.type === "thread.settled");
      const unsnoozed = events.find((entry) => entry.type === "thread.unsnoozed");
      if (settled?.type === "thread.settled" && unsnoozed?.type === "thread.unsnoozed") {
        expect(settled.payload.settledAt).toBe(SETTLED_AT);
        expect(settled.payload.updatedAt).toBe(NOW);
        expect(unsnoozed.payload.updatedAt).not.toBe(NOW);
      }
    }),
  );

  it.effect("settling a pinned and snoozed thread clears the pin and snooze", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-pinned-snoozed"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null, null, null, [], [], {
          pinnedAt: SETTLED_AT,
          snoozedUntil: "1970-01-02T09:00:00.000Z",
        }),
      });
      const events = Array.isArray(result) ? result : [result];
      expect(events.map((entry) => entry.type)).toEqual([
        "thread.settled",
        "thread.unpinned",
        "thread.unsnoozed",
      ]);
    }),
  );

  it.effect("rejects settling a thread with a live session", () =>
    Effect.gen(function* () {
      for (const status of ["starting", "running"] as const) {
        const error = yield* decideOrchestrationCommand({
          command: {
            type: "thread.settle",
            commandId: CommandId.make(`cmd-settle-live-${status}`),
            threadId: ThreadId.make("thread-1"),
          },
          readModel: makeReadModel(null, null, makeSession(status)),
        }).pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "OrchestrationThreadSettleBlockedError",
          threadId: ThreadId.make("thread-1"),
          message: SETTLE_BLOCKED_MESSAGE,
        });
      }
      const settled = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-stopped"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null, null, makeSession("stopped")),
      });
      const settledEvents = Array.isArray(settled) ? settled : [settled];
      expect(settledEvents[0]?.type).toBe("thread.settled");
    }),
  );

  it.effect("rejects settling a thread with an open approval or user-input request", () =>
    Effect.gen(function* () {
      const requestActivity = (kind: string, requestId: string, at: string) =>
        ({
          id: EventId.make(`activity-${requestId}-${kind}`),
          tone: "approval" as const,
          kind,
          summary: kind,
          payload: { requestId },
          turnId: null,
          createdAt: at,
        }) as OrchestrationThread["activities"][number];

      const openError = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-pending"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null, null, null, [
          requestActivity("approval.requested", "req-1", NOW),
        ]),
      }).pipe(Effect.flip);
      expect(openError).toMatchObject({
        _tag: "OrchestrationThreadSettleBlockedError",
        threadId: ThreadId.make("thread-1"),
        message: SETTLE_BLOCKED_MESSAGE,
      });

      const settled = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-resolved"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null, null, null, [
          requestActivity("approval.requested", "req-1", NOW),
          requestActivity("approval.resolved", "req-1", NOW),
        ]),
      });
      const settledEvents = Array.isArray(settled) ? settled : [settled];
      expect(settledEvents[0]?.type).toBe("thread.settled");

      const inputError = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-pending-input"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null, null, null, [
          requestActivity("user-input.requested", "req-2", NOW),
        ]),
      }).pipe(Effect.flip);
      expect(inputError).toMatchObject({
        _tag: "OrchestrationThreadSettleBlockedError",
        threadId: ThreadId.make("thread-1"),
        message: SETTLE_BLOCKED_MESSAGE,
      });
    }),
  );

  it.effect("manual settlement dismisses async questions without starting a turn", () =>
    Effect.gen(function* () {
      const question = (requestId: string): OrchestrationThread["activities"][number] => ({
        id: EventId.make(requestId),
        kind: "user-input.requested",
        summary: "Question",
        tone: "approval",
        turnId: null,
        createdAt: "1969-12-31T00:00:00.000Z",
        payload: { requestId, responseMode: "message" },
      });
      const readModel = makeReadModel(null, null, makeSession("ready"), [
        question("first"),
        question("second"),
        question("answered"),
        {
          ...question("answered"),
          id: EventId.make("answer"),
          createdAt: "1969-12-31T01:00:00.000Z",
          kind: "user-input.resolved",
        },
      ]);
      const command = {
        type: "thread.settle" as const,
        commandId: CommandId.make("settle-async"),
        threadId: ThreadId.make("thread-1"),
      };
      const result = yield* decideOrchestrationCommand({ command, readModel });
      const events = Array.isArray(result) ? result : [result];
      expect(events.map((event) => event.type)).toEqual([
        "thread.settled",
        "thread.activity-appended",
        "thread.activity-appended",
      ]);
      expect(events.slice(1).map((event) => event.payload)).toEqual(
        ["first", "second"].map((requestId) => ({
          threadId: command.threadId,
          activity: expect.objectContaining({
            kind: "user-input.resolved",
            summary: "User input dismissed",
            payload: { requestId, responseMode: "message" },
          }),
        })),
      );
      let projected = readModel;
      for (const [index, event] of events.entries()) {
        projected = yield* projectEvent(projected, { ...event, sequence: index + 1 });
      }
      expect(projected.threads[0]?.settledOverride).toBe("settled");
      expect(projected.threads[0]?.messages).toEqual([]);
      const repeated = yield* decideOrchestrationCommand({ command, readModel: projected });
      expect(repeated).toMatchObject({ type: "thread.settled" });
    }),
  );

  it.effect("async questions do not bypass automatic settlement or other blockers", () =>
    Effect.gen(function* () {
      const question: OrchestrationThread["activities"][number] = {
        id: EventId.make("async-question"),
        kind: "user-input.requested",
        summary: "Question",
        tone: "approval",
        turnId: null,
        createdAt: NOW,
        payload: { requestId: "async-question", responseMode: "message" },
      };
      for (const blocker of ["auto", "running", "starting", "approval", "native"] as const) {
        const error = yield* decideOrchestrationCommand({
          command:
            blocker === "auto"
              ? {
                  type: "thread.auto-settle",
                  commandId: CommandId.make(`settle-${blocker}`),
                  threadId: ThreadId.make("thread-1"),
                  snapshotSequence: 0,
                  settledAt: NOW,
                }
              : {
                  type: "thread.settle",
                  commandId: CommandId.make(`settle-${blocker}`),
                  threadId: ThreadId.make("thread-1"),
                },
          readModel: makeReadModel(
            null,
            null,
            makeSession(blocker === "running" || blocker === "starting" ? blocker : "ready"),
            [
              question,
              ...(blocker === "approval" || blocker === "native"
                ? [
                    {
                      ...question,
                      id: EventId.make("blocking-request"),
                      kind: blocker === "approval" ? "approval.requested" : "user-input.requested",
                      payload: { requestId: "blocking-request" },
                    },
                  ]
                : []),
            ],
          ),
        }).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: "OrchestrationThreadSettleBlockedError" });
      }
    }),
  );

  it.effect("clears an open request when its respond failure marks it stale", () =>
    Effect.gen(function* () {
      const activity = (
        kind: string,
        requestId: string,
        payload: Record<string, unknown>,
      ): OrchestrationThread["activities"][number] =>
        ({
          id: EventId.make(`activity-${requestId}-${kind}`),
          tone: "approval" as const,
          kind,
          summary: kind,
          payload: { requestId, ...payload },
          turnId: null,
          createdAt: NOW,
        }) as OrchestrationThread["activities"][number];

      const settled = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-stale-failed"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null, null, null, [
          activity("approval.requested", "req-1", {}),
          activity("provider.approval.respond.failed", "req-1", {
            detail: "Unknown pending approval request req-1",
          }),
          activity("user-input.requested", "req-2", {}),
          activity("provider.user-input.respond.failed", "req-2", {
            detail: "stale pending user-input request req-2",
          }),
        ]),
      });
      const settledEvents = Array.isArray(settled) ? settled : [settled];
      expect(settledEvents[0]?.type).toBe("thread.settled");

      const stillOpen = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-transient-failed"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null, null, null, [
          activity("approval.requested", "req-3", {}),
          activity("provider.approval.respond.failed", "req-3", {
            detail: "provider connection reset",
          }),
        ]),
      }).pipe(Effect.flip);
      expect(stillOpen).toMatchObject({
        _tag: "OrchestrationThreadSettleBlockedError",
        threadId: ThreadId.make("thread-1"),
        message: SETTLE_BLOCKED_MESSAGE,
      });
    }),
  );

  it.effect("bounds the queued-turn grace window against client clock skew", () =>
    Effect.gen(function* () {
      const userMessage = (createdAt: string): OrchestrationThread["messages"][number] => ({
        id: MessageId.make("message-queued"),
        role: "user",
        text: "Continue",
        turnId: null,
        streaming: false,
        createdAt,
        updatedAt: createdAt,
      });

      const queuedError = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-queued"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null, null, null, [], [userMessage("1969-12-31T23:59:30.000Z")]),
      }).pipe(Effect.flip);
      expect(queuedError).toMatchObject({
        _tag: "OrchestrationThreadSettleBlockedError",
        threadId: ThreadId.make("thread-1"),
        message: SETTLE_BLOCKED_MESSAGE,
      });

      const skewed = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-skewed"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null, null, null, [], [userMessage("1970-01-01T01:00:00.000Z")]),
      });
      const skewedEvents = Array.isArray(skewed) ? skewed : [skewed];
      expect(skewedEvents[0]?.type).toBe("thread.settled");
    }),
  );

  it.effect("rejects settling and unsettling archived threads", () =>
    Effect.gen(function* () {
      const settleError = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-archived"),
          threadId: ThreadId.make("thread-1"),
        },
        readModel: makeReadModel(null, NOW),
      }).pipe(Effect.flip);
      expect(settleError._tag).toBe("OrchestrationCommandInvariantError");

      const unsettleError = yield* decideOrchestrationCommand({
        command: {
          type: "thread.unsettle",
          commandId: CommandId.make("cmd-unsettle-archived"),
          threadId: ThreadId.make("thread-1"),
          reason: "user",
        },
        readModel: makeReadModel("settled", NOW),
      }).pipe(Effect.flip);
      expect(unsettleError._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("maps unsettle reasons to overrides and re-emits idempotently", () =>
    Effect.gen(function* () {
      const userEvent = yield* decideOrchestrationCommand({
        command: {
          type: "thread.unsettle",
          commandId: CommandId.make("cmd-unsettle-user"),
          threadId: ThreadId.make("thread-1"),
          reason: "user",
        },
        readModel: makeReadModel("settled"),
      });
      const userEvents = Array.isArray(userEvent) ? userEvent : [userEvent];
      expect(userEvents).toHaveLength(1);
      expect(userEvents[0]?.type).toBe("thread.unsettled");
      if (userEvents[0]?.type === "thread.unsettled") {
        expect(userEvents[0].payload.reason).toBe("user");
      }

      const userAgain = yield* decideOrchestrationCommand({
        command: {
          type: "thread.unsettle",
          commandId: CommandId.make("cmd-unsettle-user-again"),
          threadId: ThreadId.make("thread-1"),
          reason: "user",
        },
        readModel: makeReadModel("active"),
      });
      const userAgainEvents = Array.isArray(userAgain) ? userAgain : [userAgain];
      expect(userAgainEvents).toHaveLength(1);
      expect(userAgainEvents[0]?.type).toBe("thread.unsettled");
    }),
  );

  it.effect("an accepted un-settle re-anchors the thread for the active list", () =>
    Effect.gen(function* () {
      const readModel = makeReadModel("settled");
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.unsettle",
          commandId: CommandId.make("cmd-unsettle-anchor"),
          threadId: ThreadId.make("thread-1"),
          reason: "user",
        },
        readModel,
      });
      const events = Array.isArray(result) ? result : [result];
      const unsettled = events[0]!;
      expect(unsettled.type).toBe("thread.unsettled");

      const projected = yield* projectEvent(readModel, {
        ...unsettled,
        sequence: readModel.snapshotSequence + 1,
      } as OrchestrationEvent);
      const thread = projected.threads[0]!;
      expect(thread.settledOverride).toBe("active");
      expect(thread.unsettledAt).toBe(unsettled.occurredAt);
      if (unsettled.type === "thread.unsettled") {
        expect(thread.unsettledAt).toBe(unsettled.payload.updatedAt);
      }
    }),
  );

  it.effect("prepends activity unsets for turn starts and live session updates", () =>
    Effect.gen(function* () {
      const turnResult = yield* decideOrchestrationCommand({
        command: {
          type: "thread.turn.start",
          commandId: CommandId.make("cmd-turn-start"),
          threadId: ThreadId.make("thread-1"),
          message: {
            messageId: MessageId.make("message-1"),
            role: "user",
            text: "Continue",
            attachments: [],
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: NOW,
        },
        readModel: makeReadModel("settled"),
      });
      const turnEvents = Array.isArray(turnResult) ? turnResult : [turnResult];
      expect(turnEvents.map((event) => event.type)).toEqual([
        "thread.unsettled",
        "thread.message-sent",
        "thread.turn-start-requested",
      ]);

      const sessionResult = yield* decideOrchestrationCommand({
        command: {
          type: "thread.session.set",
          commandId: CommandId.make("cmd-session-set"),
          threadId: ThreadId.make("thread-1"),
          session: makeSession("running"),
          createdAt: NOW,
        },
        readModel: makeReadModel("active"),
      });
      const sessionEvents = Array.isArray(sessionResult) ? sessionResult : [sessionResult];
      expect(sessionEvents.map((event) => event.type)).toEqual([
        "thread.unsettled",
        "thread.session-set",
      ]);
    }),
  );

  it.effect("clears a keep-active pin on real activity", () =>
    Effect.gen(function* () {
      const turnResult = yield* decideOrchestrationCommand({
        command: {
          type: "thread.turn.start",
          commandId: CommandId.make("cmd-active-turn-start"),
          threadId: ThreadId.make("thread-1"),
          message: {
            messageId: MessageId.make("message-active"),
            role: "user",
            text: "Continue",
            attachments: [],
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: NOW,
        },
        readModel: makeReadModel("active"),
      });
      const turnEvents = Array.isArray(turnResult) ? turnResult : [turnResult];
      expect(turnEvents.map((event) => event.type)).toEqual([
        "thread.unsettled",
        "thread.message-sent",
        "thread.turn-start-requested",
      ]);

      const activityResult = yield* decideOrchestrationCommand({
        command: {
          type: "thread.activity.append",
          commandId: CommandId.make("cmd-active-approval"),
          threadId: ThreadId.make("thread-1"),
          activity: {
            id: EventId.make("activity-active"),
            tone: "approval",
            kind: "approval.requested",
            summary: "Command approval requested",
            payload: null,
            turnId: null,
            createdAt: NOW,
          },
          createdAt: NOW,
        },
        readModel: makeReadModel("active"),
      });
      const activityEvents = Array.isArray(activityResult) ? activityResult : [activityResult];
      expect(activityEvents.map((event) => event.type)).toEqual([
        "thread.unsettled",
        "thread.activity-appended",
      ]);
    }),
  );

  it.effect("does not unsettle for session stop/error status writes", () =>
    Effect.gen(function* () {
      for (const status of ["stopped", "error", "ready", "idle"] as const) {
        const result = yield* decideOrchestrationCommand({
          command: {
            type: "thread.session.set",
            commandId: CommandId.make(`cmd-session-${status}`),
            threadId: ThreadId.make("thread-1"),
            session: makeSession(status),
            createdAt: NOW,
          },
          readModel: makeReadModel("settled"),
        });
        const events = Array.isArray(result) ? result : [result];
        expect(events.map((event) => event.type)).toEqual(["thread.session-set"]);
      }
    }),
  );

  it.effect("unsettles for approval and user-input activities but not others", () =>
    Effect.gen(function* () {
      const approvalResult = yield* decideOrchestrationCommand({
        command: {
          type: "thread.activity.append",
          commandId: CommandId.make("cmd-activity-approval"),
          threadId: ThreadId.make("thread-1"),
          activity: {
            id: EventId.make("activity-1"),
            tone: "approval",
            kind: "approval.requested",
            summary: "Command approval requested",
            payload: null,
            turnId: null,
            createdAt: NOW,
          },
          createdAt: NOW,
        },
        readModel: makeReadModel("settled"),
      });
      const approvalEvents = Array.isArray(approvalResult) ? approvalResult : [approvalResult];
      expect(approvalEvents.map((event) => event.type)).toEqual([
        "thread.unsettled",
        "thread.activity-appended",
      ]);

      const routineResult = yield* decideOrchestrationCommand({
        command: {
          type: "thread.activity.append",
          commandId: CommandId.make("cmd-activity-routine"),
          threadId: ThreadId.make("thread-1"),
          activity: {
            id: EventId.make("activity-2"),
            tone: "info",
            kind: "tool.completed",
            summary: "Tool completed",
            payload: null,
            turnId: null,
            createdAt: NOW,
          },
          createdAt: NOW,
        },
        readModel: makeReadModel("settled"),
      });
      const routineEvents = Array.isArray(routineResult) ? routineResult : [routineResult];
      expect(routineEvents.map((event) => event.type)).toEqual(["thread.activity-appended"]);
    }),
  );

  it.effect("drops an onlyIfSettled session stop when the thread was re-engaged", () =>
    Effect.gen(function* () {
      const stopCommand = (commandId: string) =>
        ({
          type: "thread.session.stop",
          commandId: CommandId.make(commandId),
          threadId: ThreadId.make("thread-1"),
          createdAt: NOW,
          onlyIfSettled: true,
        }) as const;

      const stopped = yield* decideOrchestrationCommand({
        command: stopCommand("cmd-stop-settled-idle"),
        readModel: makeReadModel("settled", null, makeSession("ready")),
      });
      const stoppedEvents = Array.isArray(stopped) ? stopped : [stopped];
      expect(stoppedEvents.map((event) => event.type)).toEqual(["thread.session-stop-requested"]);

      const unsettledError = yield* decideOrchestrationCommand({
        command: stopCommand("cmd-stop-unsettled"),
        readModel: makeReadModel(null, null, makeSession("starting")),
      }).pipe(Effect.flip);
      expect(unsettledError._tag).toBe("OrchestrationCommandInvariantError");

      const aliveError = yield* decideOrchestrationCommand({
        command: stopCommand("cmd-stop-session-alive"),
        readModel: makeReadModel("settled", null, makeSession("starting")),
      }).pipe(Effect.flip);
      expect(aliveError._tag).toBe("OrchestrationCommandInvariantError");

      const unconditional = yield* decideOrchestrationCommand({
        command: {
          type: "thread.session.stop",
          commandId: CommandId.make("cmd-stop-unconditional"),
          threadId: ThreadId.make("thread-1"),
          createdAt: NOW,
        },
        readModel: makeReadModel(null, null, makeSession("starting")),
      });
      const unconditionalEvents = Array.isArray(unconditional) ? unconditional : [unconditional];
      expect(unconditionalEvents.map((event) => event.type)).toEqual([
        "thread.session-stop-requested",
      ]);
    }),
  );
});

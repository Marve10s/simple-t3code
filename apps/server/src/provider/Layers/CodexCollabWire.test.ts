import { assert, describe, it } from "vite-plus/test";

import fixture from "../testFixtures/codexMultiAgentWire.json" with { type: "json" };
import { routeCodexChildNotification } from "./CodexSessionRuntime.ts";

interface WireNotification {
  readonly method: string;
  readonly params: Record<string, unknown>;
}

const notifications = fixture.notifications as ReadonlyArray<WireNotification>;
const rootThreadId = fixture.rootThreadId;
const childThreadIds = new Set(fixture.childThreadIds);

function notificationThreadId(entry: WireNotification): string | undefined {
  const params = entry.params;
  const thread = params.thread;
  if (
    typeof thread === "object" &&
    thread !== null &&
    typeof (thread as { id?: unknown }).id === "string"
  ) {
    return (thread as { id: string }).id;
  }
  return typeof params.threadId === "string" ? params.threadId : undefined;
}

function subAgentActivityItems(): ReadonlyArray<Record<string, unknown>> {
  return notifications.flatMap((entry) => {
    const item = entry.params.item;
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    return record.type === "subAgentActivity" ? [record] : [];
  });
}

describe("codex multi-agent wire capture", () => {
  it("captures a real two-child fan-out", () => {
    assert.equal(fixture.capturedWith.model, "gpt-5.6-luna");
    assert.equal(childThreadIds.size, 2);
    const paths = subAgentActivityItems().map((item) => item.agentPath);
    assert.include(paths, "/root/alpha");
    assert.include(paths, "/root/beta");
  });

  it("emits child traffic BEFORE the item that registers the child", () => {
    const firstChildTraffic = notifications.findIndex((entry) => {
      const threadId = notificationThreadId(entry);
      return threadId !== undefined && childThreadIds.has(threadId);
    });
    const firstRegistration = notifications.findIndex((entry) => {
      const item = entry.params.item;
      if (typeof item !== "object" || item === null) return false;
      const record = item as Record<string, unknown>;
      return record.type === "subAgentActivity" && record.kind === "started";
    });
    assert.isAtLeast(firstChildTraffic, 0);
    assert.isAtLeast(firstRegistration, 0);
    assert.isBelow(
      firstChildTraffic,
      firstRegistration,
      "capture should exercise child-first ordering",
    );
  });

  it("contains a /root self-activity emitted from a CHILD thread", () => {
    const rootSelfActivity = subAgentActivityItems().find((item) => item.agentPath === "/root");
    assert.isDefined(rootSelfActivity, "capture should contain a /root self-activity");
    assert.equal(rootSelfActivity?.agentThreadId, rootThreadId);
  });

  it("routes every captured child method to a defined disposition", () => {
    const childMethods = new Set(
      notifications
        .filter((entry) => {
          const threadId = notificationThreadId(entry);
          return threadId !== undefined && childThreadIds.has(threadId);
        })
        .map((entry) => entry.method),
    );
    assert.isAbove(childMethods.size, 0);
    for (const method of childMethods) {
      const route = routeCodexChildNotification(method);
      assert.equal(route, "agent-event", `${method} should map to an agent event`);
    }
  });
});

describe("routeCodexChildNotification", () => {
  it("maps child lifecycle to agent events", () => {
    for (const method of [
      "turn/started",
      "turn/completed",
      "thread/status/changed",
      "thread/tokenUsage/updated",
      "thread/settings/updated",
      "model/rerouted",
      "item/started",
      "item/completed",
      "thread/closed",
      "error",
    ]) {
      assert.equal(routeCodexChildNotification(method), "agent-event", method);
    }
  });

  it("drops only enumerated child chatter", () => {
    for (const method of [
      "item/agentMessage/delta",
      "item/reasoning/textDelta",
      "item/commandExecution/outputDelta",
      "turn/plan/updated",
      "thread/name/updated",
    ]) {
      assert.equal(routeCodexChildNotification(method), "drop", method);
    }
  });

  it("never routes child-owned thread lifecycle to the parent", () => {
    for (const method of [
      "thread/started",
      "thread/status/changed",
      "thread/archived",
      "thread/unarchived",
      "thread/closed",
      "thread/compacted",
      "thread/name/updated",
      "thread/tokenUsage/updated",
      "turn/started",
      "turn/completed",
      "turn/plan/updated",
      "item/plan/delta",
      "thread/settings/updated",
      "model/rerouted",
    ]) {
      assert.notEqual(
        routeCodexChildNotification(method),
        "parent",
        `${method} is child-owned and must not reach the parent path`,
      );
    }
  });

  it("sends parent-owned and UNKNOWN methods to the parent path", () => {
    assert.equal(routeCodexChildNotification("serverRequest/resolved"), "parent");
    assert.equal(routeCodexChildNotification("thread/somethingBrandNew"), "parent");
    assert.equal(routeCodexChildNotification("account/rateLimits/updated"), "parent");
  });
});

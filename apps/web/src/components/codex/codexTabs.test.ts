import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { DraftId } from "../../composerDraftStore";

import { closeCodexTab, openCodexTab, type CodexTab } from "./codexTabs";

const thread = (threadId: string): CodexTab => ({
  kind: "thread",
  key: `env:${threadId}`,
  environmentId: "env" as EnvironmentId,
  threadId: threadId as ThreadId,
});
const draft = (draftId: string, threadId: string): CodexTab => ({
  kind: "draft",
  key: `draft:${draftId}`,
  draftId: draftId as DraftId,
  threadId: threadId as ThreadId,
});

describe("openCodexTab", () => {
  it("opens a new tab right after the active one", () => {
    const tabs = [thread("a"), thread("b")];
    expect(openCodexTab(tabs, thread("c"), "env:a").map((tab) => tab.key)).toEqual([
      "env:a",
      "env:c",
      "env:b",
    ]);
  });

  it("focuses an already open tab without duplicating it", () => {
    const tabs = [thread("a"), thread("b")];
    expect(openCodexTab(tabs, thread("b"), "env:a")).toBe(tabs);
  });

  it("keeps a new chat's tab in place when its draft becomes a thread", () => {
    const tabs = [thread("a"), draft("d1", "t-new"), thread("b")];
    expect(openCodexTab(tabs, thread("t-new"), "draft:d1").map((tab) => tab.key)).toEqual([
      "env:a",
      "env:t-new",
      "env:b",
    ]);
  });
});

describe("closeCodexTab", () => {
  it("focuses the right neighbor, then the left one", () => {
    const tabs = [thread("a"), thread("b"), thread("c")];
    expect(closeCodexTab(tabs, "env:b").neighbor?.key).toBe("env:c");
    expect(closeCodexTab(tabs, "env:c").neighbor?.key).toBe("env:b");
    expect(closeCodexTab([thread("a")], "env:a")).toEqual({ tabs: [], neighbor: null });
  });
});

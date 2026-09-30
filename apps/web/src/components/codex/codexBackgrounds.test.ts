import { describe, expect, it } from "vite-plus/test";

import { pickBackgroundForDraft } from "./codexBackgrounds";

describe("pickBackgroundForDraft", () => {
  const pool = ["a", "b", "c", "d", "e", "f"];

  it("keeps one new chat on the same image", () => {
    expect(pickBackgroundForDraft(pool, "draft-1")).toBe(pickBackgroundForDraft(pool, "draft-1"));
  });

  it("spreads new chats across the whole pool", () => {
    const picks = new Set(
      Array.from({ length: 60 }, (_, index) => pickBackgroundForDraft(pool, `draft-${index}`)),
    );
    expect(picks.size).toBe(pool.length);
  });

  it("returns nothing when there are no images", () => {
    expect(pickBackgroundForDraft([], "draft-1")).toBeNull();
  });
});

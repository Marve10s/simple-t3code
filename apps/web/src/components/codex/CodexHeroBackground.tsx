import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { resolveThreadRouteTarget } from "../../threadRoutes";
import { useCustomBackgrounds } from "./codexBackgroundStore";
import {
  BUNDLED_BACKGROUNDS,
  pickBackgroundForDraft,
  useCodexBackgroundChoice,
  useCodexBackgroundEnabled,
} from "./codexBackgrounds";

export function CodexHeroBackground() {
  const [enabled] = useCodexBackgroundEnabled();
  const [choice] = useCodexBackgroundChoice();
  const customBackgrounds = useCustomBackgrounds();
  const draftId = useParams({
    strict: false,
    select: (params) => {
      const target = resolveThreadRouteTarget(params);
      return target?.kind === "draft" ? target.draftId : null;
    },
  });

  const background = useMemo(() => {
    if (!enabled || draftId === null) return null;
    const pool = [...BUNDLED_BACKGROUNDS, ...customBackgrounds];
    if (choice !== "random") {
      const pinned = pool.find((candidate) => candidate.id === choice);
      if (pinned) return pinned;
    }
    return pickBackgroundForDraft(pool, draftId);
  }, [choice, customBackgrounds, draftId, enabled]);

  useEffect(() => {
    const root = document.documentElement;
    if (background === null) {
      delete root.dataset.codexHeroBackground;
      root.style.removeProperty("--codex-hero-image");
      return;
    }
    const image = new Image();
    image.src = background.src;
    let cancelled = false;
    void image
      .decode()
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        root.style.setProperty("--codex-hero-image", `url("${background.src}")`);
        root.dataset.codexHeroBackground = background.id;
      });
    return () => {
      cancelled = true;
    };
  }, [background]);

  return null;
}

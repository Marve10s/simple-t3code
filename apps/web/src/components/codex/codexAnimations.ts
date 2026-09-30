import * as Schema from "effect/Schema";
import { lazy } from "react";

import { useMediaQuery } from "../../hooks/useMediaQuery";

import { useLocalStorage } from "../../hooks/useLocalStorage";

export const CodexAnimationStyle = Schema.Literals(["standard", "motion"]);
export type CodexAnimationStyle = typeof CodexAnimationStyle.Type;
export const decodeCodexAnimationStyle = Schema.decodeUnknownSync(CodexAnimationStyle);

export function useCodexAnimationStyle() {
  return useLocalStorage(
    "simplet3code:animations",
    "motion" as CodexAnimationStyle,
    CodexAnimationStyle,
  );
}

export function useCodexHeroMotion() {
  const [style] = useCodexAnimationStyle();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  return style === "motion" && !reducedMotion;
}

const CODEX_COMPOSER_TRANSITION_MS = 280;

export function useCodexComposerAnimation(panel: { active: boolean; durationMs: number }) {
  const motion = useCodexHeroMotion();
  if (!motion || panel.durationMs > 0) return panel;
  return { active: true, durationMs: CODEX_COMPOSER_TRANSITION_MS };
}

const loadMotion = () => import("./motion/CodexMotion");

export const LazyMotionTabStrip = lazy(() =>
  loadMotion().then((module) => ({ default: module.MotionTabStrip })),
);
export const LazyMotionRailIndicator = lazy(() =>
  loadMotion().then((module) => ({ default: module.MotionRailIndicator })),
);
export const LazyMotionEffects = lazy(() =>
  loadMotion().then((module) => ({ default: module.MotionEffects })),
);

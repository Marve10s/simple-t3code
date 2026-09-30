import * as Schema from "effect/Schema";
import { lazy } from "react";

import { useMediaQuery } from "../../hooks/useMediaQuery";

import { useLocalStorage } from "../../hooks/useLocalStorage";

/**
 * - standard: upstream T3 Code motion only (CSS and Web Animations).
 * - motion: adds Motion-powered transitions. The Motion library lives in its
 *   own chunk and is fetched only while this option is selected, so Standard
 *   never downloads, parses, or runs it.
 */
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

/** Whether the new-chat composer should glide down when the chat starts. */
export function useCodexHeroMotion() {
  const [style] = useCodexAnimationStyle();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  return style === "motion" && !reducedMotion;
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

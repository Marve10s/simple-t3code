/**
 * Timing the Motion chunk publishes when it loads, read by upstream code that
 * runs its own Web Animations (the new-chat composer settling to the bottom).
 * Motion computes the spring once; the animation itself stays a native
 * compositor animation, so upstream's cancel/finish handling keeps working.
 */
export interface CodexMotionTiming {
  readonly durationMs: number;
  readonly easing: string;
}

let heroTransition: CodexMotionTiming | null = null;

export function setCodexHeroTransitionTiming(timing: CodexMotionTiming) {
  heroTransition = timing;
}

export function getCodexHeroTransitionTiming(): CodexMotionTiming | null {
  return heroTransition;
}

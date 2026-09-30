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

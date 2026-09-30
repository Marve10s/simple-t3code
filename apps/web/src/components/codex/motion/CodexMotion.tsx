import { useLocation } from "@tanstack/react-router";
import { animate, spring } from "motion";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useEffect } from "react";

import { CodexNewTabButton, CodexTabContents, useCodexTabStrip } from "../CodexTabStrip";
import { codexTabRenderKey } from "../codexTabs";
import { setCodexHeroTransitionTiming } from "../codexMotionTiming";
import { useCodexView } from "../codexView";

const heroSpring = /^(\d+(?:\.\d+)?)ms (linear\(.+\))$/.exec(String(spring(0.5, 0.14)));
if (heroSpring?.[1] && heroSpring[2]) {
  setCodexHeroTransitionTiming({ durationMs: Number(heroSpring[1]), easing: heroSpring[2] });
}

const sidebarSpring = /^(\d+(?:\.\d+)?)ms (linear\(.+\))$/.exec(String(spring(0.34, 0)));
if (sidebarSpring?.[1] && sidebarSpring[2]) {
  document.documentElement.style.setProperty("--codex-sidebar-duration", `${sidebarSpring[1]}ms`);
  document.documentElement.style.setProperty("--codex-sidebar-easing", sidebarSpring[2]);
}

const SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;
const EASE_OUT = [0.19, 1, 0.22, 1] as const;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MotionTabStrip() {
  const strip = useCodexTabStrip();
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <LayoutGroup id="codex-tabs">
        <motion.div
          data-codex-part="tab-strip"
          role="tablist"
          aria-label="Open chats"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AnimatePresence initial={false}>
            {strip.tabs.map((tab) => {
              const active = tab.key === strip.activeKey;
              return (
                <motion.div
                  key={codexTabRenderKey(tab)}
                  layout="position"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
                  role="tab"
                  aria-selected={active}
                  data-codex-part="tab"
                  data-active={active ? "true" : undefined}
                  onMouseDown={(event) => {
                    if (event.button === 1) strip.closeTab(event, tab);
                  }}
                >
                  {active ? (
                    <motion.span layoutId="codex-active-tab" data-codex-part="tab-active-bg" />
                  ) : null}
                  <CodexTabContents strip={strip} tab={tab} />
                </motion.div>
              );
            })}
          </AnimatePresence>
          <motion.div layout="position" data-codex-part="tab-new-slot">
            <CodexNewTabButton strip={strip} />
          </motion.div>
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}

export function MotionRailIndicator() {
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <motion.span layoutId="codex-rail-active" data-codex-part="rail-active-bg" />
    </MotionConfig>
  );
}

function fadeUp(element: Element | null, distance: number, duration: number) {
  if (!element || prefersReducedMotion()) return;
  void animate(
    element,
    { opacity: [0, 1], transform: [`translateY(${distance}px)`, "translateY(0px)"] },
    { duration, ease: EASE_OUT },
  );
}

export function MotionEffects() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [view] = useCodexView();

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      fadeUp(document.querySelector("[data-codex-hero-headline] > div"), 10, 0.5),
    );
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      fadeUp(document.querySelector("[data-app-sidebar] [data-slot='sidebar-inner']"), 4, 0.28),
    );
    return () => cancelAnimationFrame(frame);
  }, [view]);

  return null;
}

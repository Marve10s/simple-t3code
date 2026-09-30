import { useLocation } from "@tanstack/react-router";
import { animate, spring } from "motion";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useEffect } from "react";

import { CodexNewTabButton, CodexTabContents, useCodexTabStrip } from "../CodexTabStrip";
import { setCodexHeroTransitionTiming } from "../codexMotionTiming";
import { useCodexView } from "../codexView";

const heroSpring = /^(\d+(?:\.\d+)?)ms (linear\(.+\))$/.exec(String(spring(0.5, 0.14)));
if (heroSpring?.[1] && heroSpring[2]) {
  setCodexHeroTransitionTiming({ durationMs: Number(heroSpring[1]), easing: heroSpring[2] });
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
        <div data-codex-part="tab-strip" role="tablist" aria-label="Open chats">
          <AnimatePresence initial={false}>
            {strip.tabs.map((tab) => {
              const active = tab.key === strip.activeKey;
              return (
                <motion.div
                  key={tab.key}
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
        </div>
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

const SIDEBAR_SPRING = { type: "spring", visualDuration: 0.34, bounce: 0 } as const;

function slideFrom(element: HTMLElement, offsetX: number) {
  if (Math.abs(offsetX) < 1) return;
  element.style.transform = `translateX(${offsetX}px)`;
  void animate(
    element,
    { transform: [`translateX(${offsetX}px)`, "translateX(0px)"] },
    SIDEBAR_SPRING,
  ).then(() => {
    element.style.removeProperty("transform");
  });
}

function useSidebarMotion() {
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const observer = new MutationObserver((records) => {
      if (!desktop.matches || prefersReducedMotion()) return;
      for (const record of records) {
        const sidebar = record.target;
        if (!(sidebar instanceof HTMLElement) || sidebar.dataset.slot !== "sidebar") continue;
        const container = sidebar.querySelector<HTMLElement>("[data-slot='sidebar-container']");
        const main = document.querySelector<HTMLElement>("main[data-slot='sidebar-inset']");
        if (!container || !main || getComputedStyle(sidebar).display === "none") continue;
        const width = container.getBoundingClientRect().width;
        const railWidth =
          Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue("--codex-rail-width"),
          ) || 0;
        const expanded = sidebar.dataset.state === "expanded";
        slideFrom(container, expanded ? -width - railWidth : width + railWidth);
        slideFrom(main, expanded ? -width : width);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
      attributeOldValue: true,
    });
    return () => observer.disconnect();
  }, []);
}

export function MotionEffects() {
  useSidebarMotion();
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

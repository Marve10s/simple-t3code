import { useEffect, useId, useRef } from "react";

export const LIVE_REFRESH_MIN_INTERVAL_MS = 10_000;

export const LIVE_REFRESH_INTERVAL_MS = 5 * 60_000;

export const LIVE_REFRESH_IDLE_AFTER_MS = 6 * 60_000;

export function shouldLiveRefresh(input: {
  readonly visible: boolean;
  readonly now: number;
  readonly lastRefreshedAt: number;
}): boolean {
  return input.visible && input.now - input.lastRefreshedAt >= LIVE_REFRESH_MIN_INTERVAL_MS;
}

export function shouldRefreshOnArrival(input: {
  readonly visible: boolean;
  readonly now: number;
  readonly lastRefreshedAt: number | undefined;
}): boolean {
  return (
    input.lastRefreshedAt !== undefined &&
    shouldLiveRefresh({ ...input, lastRefreshedAt: input.lastRefreshedAt })
  );
}

export function shouldRefreshOnInterval(input: {
  readonly visible: boolean;
  readonly now: number;
  readonly lastRefreshedAt: number;
  readonly lastInteractedAt: number;
}): boolean {
  return (
    input.now - input.lastInteractedAt < LIVE_REFRESH_IDLE_AFTER_MS && shouldLiveRefresh(input)
  );
}

const lastRefreshedAtByView = new Map<string, number>();

let lastInteractedAt = 0;
let interactionWatchers = 0;
const INTERACTION_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel"] as const;
const noteInteraction = () => {
  lastInteractedAt = Date.now();
};

function watchInteraction(): () => void {
  if (interactionWatchers === 0) {
    lastInteractedAt = Date.now();
    for (const event of INTERACTION_EVENTS) {
      document.addEventListener(event, noteInteraction, { passive: true });
    }
  }
  interactionWatchers += 1;
  return () => {
    interactionWatchers -= 1;
    if (interactionWatchers > 0) return;
    for (const event of INTERACTION_EVENTS) {
      document.removeEventListener(event, noteInteraction);
    }
  };
}

export function useLiveRefresh(
  refresh: (() => void) | null,
  options: { readonly enabled?: boolean; readonly key?: string } = {},
): void {
  const { enabled = true, key } = options;
  const latest = useRef(refresh);
  latest.current = refresh;
  const fallbackViewId = useId();
  const viewId = key ?? fallbackViewId;

  useEffect(() => {
    if (!enabled) return;
    const read = (now: number) => {
      lastRefreshedAtByView.set(viewId, now);
      latest.current?.();
    };
    const visible = () => document.visibilityState === "visible";
    const onArrival = () => {
      const now = Date.now();
      const lastRefreshedAt = lastRefreshedAtByView.get(viewId);
      if (lastRefreshedAt === undefined) {
        lastRefreshedAtByView.set(viewId, now);
        return;
      }
      if (shouldRefreshOnArrival({ visible: visible(), now, lastRefreshedAt })) read(now);
    };
    const onInterval = () => {
      const now = Date.now();
      const lastRefreshedAt = lastRefreshedAtByView.get(viewId) ?? now;
      if (shouldRefreshOnInterval({ visible: visible(), now, lastRefreshedAt, lastInteractedAt })) {
        read(now);
      }
    };

    let timer: ReturnType<typeof setInterval> | undefined;
    const syncTimer = () => {
      clearInterval(timer);
      timer = visible() ? setInterval(onInterval, LIVE_REFRESH_INTERVAL_MS) : undefined;
    };
    const onVisibilityChange = () => {
      onArrival();
      syncTimer();
    };

    const stopWatchingInteraction = watchInteraction();
    onArrival();
    syncTimer();
    window.addEventListener("focus", onArrival);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onArrival);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopWatchingInteraction();
    };
  }, [enabled, viewId]);
}

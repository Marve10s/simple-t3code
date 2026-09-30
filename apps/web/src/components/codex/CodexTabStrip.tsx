import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { isProjectFaviconFallbackUrl } from "@t3tools/shared/projectFavicon";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PlusIcon, XIcon } from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useRef } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useHandleNewThread } from "../../hooks/useHandleNewThread";
import { startNewThreadFromContext } from "../../lib/chatThreadActions";
import { projectFaviconUrlAtom } from "../../state/assets";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useThreadShells,
} from "../../state/entities";
import { ProjectFavicon } from "../ProjectFavicon";
import { resolveThreadRouteTarget } from "../../threadRoutes";
import { type CodexTab, closeCodexTab, openCodexTab, useCodexTabsStore } from "./codexTabs";
import { ThreadMark, useThreadMarkTones } from "./CodexThreadStatus";

/** Tab state for the "tabs" view: syncs tabs with the route and opens or closes them. */
export function useCodexTabStrip() {
  const navigate = useNavigate();
  const tabs = useCodexTabsStore((store) => store.tabs);
  const setTabs = useCodexTabsStore((store) => store.setTabs);
  const threads = useThreadShells();
  const shellsBootstrapped = useAllEnvironmentShellsBootstrapped();
  const tones = useThreadMarkTones();
  const getDraftSession = useComposerDraftStore((store) => store.getDraftSession);
  const projects = useProjects();
  const { activeDraftThread, activeThread, defaultProjectRef, handleNewThread } =
    useHandleNewThread();

  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const routeDraftThreadId = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft"
      ? (store.getDraftSession(routeTarget.draftId)?.threadId ?? null)
      : null,
  );
  const routeTab = useMemo<CodexTab | null>(() => {
    if (routeTarget?.kind === "server") {
      return {
        kind: "thread",
        key: scopedThreadKey(routeTarget.threadRef),
        environmentId: routeTarget.threadRef.environmentId,
        threadId: routeTarget.threadRef.threadId,
      };
    }
    if (routeTarget?.kind === "draft" && routeDraftThreadId !== null) {
      return {
        kind: "draft",
        key: `draft:${routeTarget.draftId}`,
        draftId: routeTarget.draftId,
        threadId: routeDraftThreadId,
      };
    }
    return null;
  }, [routeDraftThreadId, routeTarget]);
  const activeKey = routeTab?.key ?? null;

  // Every chat the user lands on gets a tab, placed after the one they came from.
  const previousActiveKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (routeTab === null) return;
    const current = useCodexTabsStore.getState().tabs;
    const next = openCodexTab(current, routeTab, previousActiveKeyRef.current);
    if (next !== current) setTabs(next);
    previousActiveKeyRef.current = routeTab.key;
  }, [routeTab, setTabs]);

  const threadByKey = useMemo(
    () =>
      new Map(
        threads.map(
          (thread) =>
            [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
        ),
      ),
    [threads],
  );

  // Archived or deleted threads and discarded drafts drop out of the strip.
  useEffect(() => {
    if (!shellsBootstrapped) return;
    const current = useCodexTabsStore.getState().tabs;
    const next = current.filter((tab) => {
      if (tab.key === activeKey) return true;
      if (tab.kind === "draft") return getDraftSession(tab.draftId) !== null;
      const thread = threadByKey.get(tab.key);
      return thread !== undefined && thread.archivedAt === null;
    });
    if (next.length !== current.length) setTabs(next);
  }, [activeKey, getDraftSession, setTabs, shellsBootstrapped, threadByKey]);

  const openTab = (tab: CodexTab) => {
    if (tab.kind === "thread") {
      void navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: tab.environmentId, threadId: tab.threadId },
      });
    } else {
      void navigate({ to: "/draft/$draftId", params: { draftId: tab.draftId } });
    }
  };

  const closeTab = (event: MouseEvent, tab: CodexTab) => {
    event.stopPropagation();
    event.preventDefault();
    const { tabs: next, neighbor } = closeCodexTab(useCodexTabsStore.getState().tabs, tab.key);
    setTabs(next);
    if (tab.key !== activeKey) return;
    if (neighbor) openTab(neighbor);
    else void navigate({ to: "/" });
  };

  const titleFor = (tab: CodexTab) =>
    (tab.kind === "thread" ? threadByKey.get(tab.key)?.title : undefined) ?? "New chat";

  const projectByKey = useMemo(
    () => new Map(projects.map((project) => [`${project.environmentId}\0${project.id}`, project])),
    [projects],
  );
  const projectFor = (tab: CodexTab): EnvironmentProject | null => {
    const owner = tab.kind === "thread" ? threadByKey.get(tab.key) : getDraftSession(tab.draftId);
    return owner ? (projectByKey.get(`${owner.environmentId}\0${owner.projectId}`) ?? null) : null;
  };

  const newChat = () =>
    void startNewThreadFromContext({
      activeDraftThread,
      activeThread: activeThread ?? undefined,
      defaultProjectRef,
      handleNewThread,
    });

  return { tabs, activeKey, tones, titleFor, projectFor, openTab, closeTab, newChat };
}

export type CodexTabStripState = ReturnType<typeof useCodexTabStrip>;

/** The project's own icon (favicon or one the user set), or its name when it has none. */
function TabProjectLabel({ project }: { project: EnvironmentProject }) {
  const faviconUrl = useAtomValue(
    projectFaviconUrlAtom({
      environmentId: project.environmentId,
      cwd: project.workspaceRoot,
      faviconPath: project.faviconPath,
    }),
  );
  const hasIcon =
    project.projectIcon != null ||
    (faviconUrl !== null && faviconUrl !== undefined && !isProjectFaviconFallbackUrl(faviconUrl));
  return hasIcon ? (
    <span data-codex-part="tab-project-icon">
      <ProjectFavicon project={project} className="size-3.5" />
    </span>
  ) : (
    <span data-codex-part="tab-project-name">{project.title}</span>
  );
}

/** The strip's trailing "+", as in a browser. */
export function CodexNewTabButton({ strip }: { strip: CodexTabStripState }) {
  return (
    <button type="button" aria-label="New chat" data-codex-part="tab-new" onClick={strip.newChat}>
      <PlusIcon />
    </button>
  );
}

/** One tab's contents, shared by the standard and Motion strips. */
export function CodexTabContents({ strip, tab }: { strip: CodexTabStripState; tab: CodexTab }) {
  const title = strip.titleFor(tab);
  const project = strip.projectFor(tab);
  return (
    <>
      <button type="button" data-codex-part="tab-main" onClick={() => strip.openTab(tab)}>
        <ThreadMark tone={strip.tones.get(tab.key) ?? null} />
        {project ? <TabProjectLabel project={project} /> : null}
        <span data-codex-part="tab-title">{title}</span>
      </button>
      <button
        type="button"
        aria-label={`Close ${title}`}
        data-codex-part="tab-close"
        onClick={(event) => strip.closeTab(event, tab)}
      >
        <XIcon />
      </button>
    </>
  );
}

/** Browser-style tabs for open chats, shown in the top bar in the "tabs" view. */
export function CodexTabStrip() {
  const strip = useCodexTabStrip();
  return (
    <div data-codex-part="tab-strip" role="tablist" aria-label="Open chats">
      {strip.tabs.map((tab) => {
        const active = tab.key === strip.activeKey;
        return (
          <div
            key={tab.key}
            role="tab"
            aria-selected={active}
            data-codex-part="tab"
            data-active={active ? "true" : undefined}
            onMouseDown={(event) => {
              // Middle click closes, as in a browser.
              if (event.button === 1) strip.closeTab(event, tab);
            }}
          >
            <CodexTabContents strip={strip} tab={tab} />
          </div>
        );
      })}
      <CodexNewTabButton strip={strip} />
    </div>
  );
}

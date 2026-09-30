import { useAtomValue } from "@effect/atom-react";
import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { isProjectFaviconFallbackUrl } from "@t3tools/shared/projectFavicon";
import { useNavigate, useParams } from "@tanstack/react-router";
import { EllipsisIcon, PlusIcon, XIcon } from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useRef } from "react";

import { composerDraftHasUserContent, useComposerDraftStore } from "../../composerDraftStore";
import { useHandleNewThread } from "../../hooks/useHandleNewThread";
import { resolveThreadActionProjectRef } from "../../lib/chatThreadActions";
import { projectFaviconUrlAtom } from "../../state/assets";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useThreadShells,
} from "../../state/entities";
import { ProjectFavicon } from "../ProjectFavicon";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { resolveThreadRouteTarget } from "../../threadRoutes";
import { type CodexTab, closeCodexTab, openCodexTab, useCodexTabsStore } from "./codexTabs";
import { ThreadMark, useThreadMarkTones } from "./CodexThreadStatus";
import { useCodexTabShortcuts } from "./useCodexTabShortcuts";

export function useCodexTabStrip() {
  const navigate = useNavigate();
  const tabs = useCodexTabsStore((store) => store.tabs);
  const setTabs = useCodexTabsStore((store) => store.setTabs);
  const threads = useThreadShells();
  const shellsBootstrapped = useAllEnvironmentShellsBootstrapped();
  const tones = useThreadMarkTones();
  const getDraftSession = useComposerDraftStore((store) => store.getDraftSession);
  const projects = useProjects();
  const { activeDraftThread, activeThread, defaultProjectRef, handleNewThread, orderedProjects } =
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
      return navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: tab.environmentId, threadId: tab.threadId },
      });
    } else {
      return navigate({ to: "/draft/$draftId", params: { draftId: tab.draftId } });
    }
  };

  const closeTab = async (event: MouseEvent, tab: CodexTab) => {
    event.stopPropagation();
    event.preventDefault();
    const { tabs: next, neighbor } = closeCodexTab(useCodexTabsStore.getState().tabs, tab.key);
    setTabs(next);
    if (tab.key === activeKey) {
      if (neighbor) await openTab(neighbor);
      else await navigate({ to: "/", state: { codexTabsClosed: true } });
    }
    if (tab.kind === "draft") {
      const { getComposerDraft, clearDraftThread } = useComposerDraftStore.getState();
      if (!composerDraftHasUserContent(getComposerDraft(tab.draftId))) {
        clearDraftThread(tab.draftId);
      }
    }
  };

  useCodexTabShortcuts(activeKey, openTab);

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

  const newChat = () => {
    const projectRef = resolveThreadActionProjectRef({
      activeDraftThread,
      activeThread: activeThread ?? undefined,
      defaultProjectRef,
      handleNewThread,
    });
    if (projectRef) void handleNewThread(projectRef, { forceNew: true });
  };
  const newChatIn = (project: EnvironmentProject) =>
    void handleNewThread(scopeProjectRef(project.environmentId, project.id), { forceNew: true });

  return {
    tabs,
    activeKey,
    tones,
    projects: orderedProjects,
    titleFor,
    projectFor,
    openTab,
    closeTab,
    newChat,
    newChatIn,
  };
}

export type CodexTabStripState = ReturnType<typeof useCodexTabStrip>;

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

export function CodexNewTabButton({ strip }: { strip: CodexTabStripState }) {
  return (
    <span data-codex-part="tab-new-group">
      <button type="button" aria-label="New chat" data-codex-part="tab-new" onClick={strip.newChat}>
        <PlusIcon />
      </button>
      <Menu>
        <MenuTrigger
          render={
            <button type="button" aria-label="New chat in project" data-codex-part="tab-new-more" />
          }
        >
          <EllipsisIcon />
        </MenuTrigger>
        <MenuPopup align="start">
          <MenuGroup>
            <MenuGroupLabel>New chat in</MenuGroupLabel>
            {strip.projects.map((project) => (
              <MenuItem
                key={`${project.environmentId}:${project.id}`}
                onClick={() => strip.newChatIn(project)}
              >
                <ProjectFavicon project={project} className="size-4" />
                <span className="max-w-64 truncate">{project.title}</span>
              </MenuItem>
            ))}
          </MenuGroup>
        </MenuPopup>
      </Menu>
    </span>
  );
}

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

import type { EnvironmentId, PullRequestRef, ScopedThreadRef } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { type MouseEvent, useCallback, useMemo } from "react";

import { pullRequestHostOf, type SourceControlProviderKind } from "@t3tools/contracts";
import { parseChangeRequestUrl, type ChangeRequestLink } from "@t3tools/shared/changeRequestUrl";
import {
  canonicalRepositoryKey,
  sourceControlRepositorySelector,
} from "@t3tools/shared/sourceControl";

import { useOpenLink } from "../browser/useOpenLink";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useRightPanelStore } from "../rightPanelStore";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

import { useProjects, useServerConfigs } from "../state/entities";
import { serverEnvironment } from "../state/server";
import { usePrimaryEnvironmentId } from "../state/environments";

export {
  parseChangeRequestUrl,
  type ChangeRequestLink,
  gitHubPullRequestBrowserUrl,
  pullRequestCandidateUrlFromReferenceAutolink,
  matchesLinkedPullRequestUrl,
  changeRequestRepositoryUrl,
} from "@t3tools/shared/changeRequestUrl";

function resolvedForgejoRepository(project: EnvironmentProject): URL | null {
  const identity = project.repositoryIdentity;
  if (identity?.provider !== "forgejo" || !identity.webUrl) return null;
  try {
    const url = new URL(identity.webUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function matchesChangeRequestAuthority(
  project: EnvironmentProject,
  link: ChangeRequestLink,
): boolean {
  if (link.authority === undefined) return true;
  try {
    const remote = new URL(project.repositoryIdentity?.locator.remoteUrl ?? "");
    if (remote.protocol === "http:" || remote.protocol === "https:") {
      return remote.host.toLowerCase() === link.authority;
    }
  } catch {}
  return true;
}

export function findProjectForChangeRequest(
  projects: ReadonlyArray<EnvironmentProject>,
  link: ChangeRequestLink,
): EnvironmentProject | undefined {
  return projects.find((project) => {
    const identity = project.repositoryIdentity;
    if (!identity || !matchesChangeRequestAuthority(project, link)) return false;
    const kind = identity.provider as SourceControlProviderKind | undefined;
    if (kind === undefined) return false;
    const web = resolvedForgejoRepository(project);
    if (web)
      return (
        web.host.toLowerCase() === (link.authority ?? link.host).toLowerCase() &&
        web.pathname.replace(/^\/+|\/+$/g, "").toLowerCase() === link.repository.toLowerCase()
      );
    if (kind === "azure-devops") {
      return (
        canonicalRepositoryKey(identity.canonicalKey.toLowerCase()) ===
        canonicalRepositoryKey(`${link.host}/${link.repository}`.toLowerCase())
      );
    }
    const repository =
      identity.displayName ??
      (identity.owner && identity.name ? `${identity.owner}/${identity.name}` : null);
    return (
      repository !== null &&
      repository.toLowerCase() === link.repository.toLowerCase() &&
      (pullRequestHostOf(identity, kind) === link.host.toLowerCase() ||
        pullRequestHostOf(identity, kind) === link.authority)
    );
  });
}

export function resolvePullRequestPreviewTarget({
  environmentId,
  projects,
  pullRequestsEnabled,
  url,
}: {
  environmentId: EnvironmentId | null;
  projects: ReadonlyArray<EnvironmentProject>;
  pullRequestsEnabled: boolean;
  url: string;
}): { environmentId: EnvironmentId; input: PullRequestRef } | null {
  if (!pullRequestsEnabled || environmentId === null) return null;
  const parsed = parseChangeRequestUrl(url);
  if (parsed === null) return null;
  const project = findProjectForChangeRequest(
    projects.filter((candidate) => candidate.environmentId === environmentId),
    parsed,
  );
  if (project === undefined) return null;
  return {
    environmentId,
    input: {
      projectId: project.id,
      host: parsed.authority ?? parsed.host,
      repository: sourceControlRepositorySelector(project.repositoryIdentity) ?? parsed.repository,
      number: parsed.number,
    },
  };
}

export function usePullRequestPreviewTarget(environmentId: EnvironmentId | null, url: string) {
  const projects = useProjects();
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  return useMemo(
    () =>
      resolvePullRequestPreviewTarget({
        environmentId,
        projects,
        pullRequestsEnabled: serverConfig?.environment.capabilities.pullRequests === true,
        url,
      }),
    [environmentId, projects, serverConfig, url],
  );
}

export function findProjectOnChangeRequestHost(
  projects: ReadonlyArray<EnvironmentProject>,
  link: ChangeRequestLink,
): EnvironmentProject | undefined {
  const own = findProjectForChangeRequest(projects, link);
  if (own !== undefined) return own;
  if (
    canonicalRepositoryKey(`${link.host}/${link.repository}`.toLowerCase()).startsWith(
      "dev.azure.com/",
    )
  )
    return undefined;
  return projects.find((project) => {
    const identity = project.repositoryIdentity;
    const kind = identity?.provider as SourceControlProviderKind | undefined;
    const web = resolvedForgejoRepository(project);
    if (web) {
      const mount = web.pathname
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .slice(0, -2)
        .join("/");
      return (
        web.host.toLowerCase() === (link.authority ?? link.host).toLowerCase() &&
        (!mount || link.repository.toLowerCase().startsWith(`${mount.toLowerCase()}/`))
      );
    }
    return (
      identity != null &&
      kind !== undefined &&
      kind !== "azure-devops" &&
      matchesChangeRequestAuthority(project, link) &&
      (pullRequestHostOf(identity, kind) === link.host.toLowerCase() ||
        pullRequestHostOf(identity, kind) === link.authority)
    );
  });
}

export function shouldOpenPullRequestExternally(
  event: Pick<MouseEvent<HTMLElement>, "metaKey" | "ctrlKey">,
): boolean {
  return event.metaKey || event.ctrlKey;
}

export function useOpenChangeRequestLink(
  threadRef?: ScopedThreadRef,
  panelRef?: ScopedThreadRef,
): (
  event: Pick<
    MouseEvent<HTMLElement>,
    "preventDefault" | "stopPropagation" | "metaKey" | "ctrlKey"
  >,
  targetUrl: string,
  targetThreadRef?: ScopedThreadRef,
  targetEnvironmentId?: EnvironmentId,
) => boolean {
  const navigate = useNavigate();
  const allProjects = useProjects();
  const serverConfigs = useServerConfigs();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  return useCallback(
    (event, targetUrl, targetThreadRef, targetEnvironmentId) => {
      if (shouldOpenPullRequestExternally(event)) return false;
      const resolvedThreadRef = targetThreadRef ?? threadRef;
      const resolvedPanelRef = panelRef ?? resolvedThreadRef;
      const parsed = parseChangeRequestUrl(targetUrl);
      if (parsed === null) return false;
      const reads = (environmentId: string) =>
        serverConfigs.get(environmentId as EnvironmentId)?.environment.capabilities.pullRequests ===
        true;
      const projects = resolvedThreadRef
        ? allProjects.filter((project) => project.environmentId === resolvedThreadRef.environmentId)
        : targetEnvironmentId
          ? allProjects.filter((project) => project.environmentId === targetEnvironmentId)
          : allProjects
              .filter((project) => reads(project.environmentId))
              .toSorted(
                (left, right) =>
                  Number(right.environmentId === primaryEnvironmentId) -
                  Number(left.environmentId === primaryEnvironmentId),
              );
      const exactProject = findProjectForChangeRequest(projects, parsed);
      const project =
        exactProject ??
        (resolvedPanelRef
          ? findProjectOnChangeRequestHost(
              projects.filter(
                (candidate) =>
                  serverConfigs.get(candidate.environmentId)?.environment.capabilities
                    .threadPullRequests === true,
              ),
              parsed,
            )
          : undefined);
      if (project === undefined || !reads(project.environmentId)) return false;
      const repository =
        serverConfigs.get(project.environmentId)?.environment.capabilities.threadPullRequests ===
        true
          ? parsed.repository
          : (sourceControlRepositorySelector(project.repositoryIdentity) ?? parsed.repository);
      event.preventDefault();
      event.stopPropagation();
      if (resolvedPanelRef) {
        useRightPanelStore.getState().openPullRequest(resolvedPanelRef, {
          ...(resolvedPanelRef.environmentId === project.environmentId
            ? {}
            : { environmentId: project.environmentId }),
          projectId: project.id,
          ...(serverConfigs.get(project.environmentId)?.environment.capabilities
            .threadPullRequests === true
            ? { host: parsed.authority ?? parsed.host }
            : {}),
          repository,
          url: targetUrl,
          number: parsed.number,
        });
        if (!resolvedThreadRef) {
          void navigate({
            to: "/pull-requests",
            search: (previous) => ({
              ...previous,
              involvement: previous.involvement ?? "all",
              state: previous.state ?? "all",
              repository,
              number: parsed.number,
              selectedHost: parsed.authority ?? parsed.host,
              selectedProjectId: project.id,
              selectedEnvironmentId: project.environmentId,
            }),
            replace: true,
          });
        }
        return true;
      }
      void navigate({
        to: "/pull-requests",
        search: {
          involvement: "all",
          state: "all",
          repository,
          number: parsed.number,
          selectedHost: parsed.authority ?? parsed.host,
          selectedProjectId: project.id,
          selectedEnvironmentId: project.environmentId,
        },
      });
      return true;
    },
    [allProjects, navigate, panelRef, primaryEnvironmentId, serverConfigs, threadRef],
  );
}

export function useOpenPrLink(threadRef?: ScopedThreadRef) {
  const openChangeRequest = useOpenChangeRequestLink(threadRef);
  const openLink = useOpenLink(threadRef);
  return useCallback(
    (event: MouseEvent<HTMLElement>, prUrl: string, targetThreadRef?: ScopedThreadRef) => {
      event.stopPropagation();
      const openInBrowser = shouldOpenPullRequestExternally(event);
      const isAnchor =
        event.currentTarget instanceof HTMLAnchorElement && event.currentTarget.href.length > 0;
      if (openInBrowser && isAnchor) return false;

      event.preventDefault();
      if (!openInBrowser && openChangeRequest(event, prUrl, targetThreadRef)) return true;

      void openLink(prUrl, { event, threadRef: targetThreadRef }).catch((error: unknown) => {
        console.error(error);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Unable to open pull request link",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      });
      return false;
    },
    [openChangeRequest, openLink],
  );
}

import { useRouter } from "@tanstack/react-router";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { useComposerDraftStore } from "../composerDraftStore";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { releaseProjectDraftUploads } from "../lib/composerDraftUploads";
import { projectEnvironment } from "../state/projects";
import { useAtomCommand } from "../state/use-atom-command";
import { stackedThreadToast, toastManager } from "../components/ui/toast";

export function useRemoveClonedProject() {
  const router = useRouter();
  const deleteProject = useAtomCommand(projectEnvironment.delete, { reportFailure: false });

  return useCallback(
    async (projectRef: ScopedProjectRef) => {
      const draftStore = useComposerDraftStore.getState();
      const result = await deleteProject({
        environmentId: projectRef.environmentId,
        input: { projectId: projectRef.projectId },
      });
      if (result._tag === "Failure") {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to remove project",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
        return false;
      }
      const routeParams = router.state.matches[router.state.matches.length - 1]?.params ?? {};
      const routeTarget = resolveThreadRouteTarget(routeParams);
      const viewingDraft =
        routeTarget?.kind === "draft" ? draftStore.getDraftSession(routeTarget.draftId) : null;
      const viewingThisProject =
        viewingDraft?.environmentId === projectRef.environmentId &&
        viewingDraft.projectId === projectRef.projectId;
      releaseProjectDraftUploads(projectRef);
      const projectDraft = draftStore.getDraftThreadByProjectRef(projectRef);
      if (projectDraft) draftStore.clearDraftThread(projectDraft.draftId);
      draftStore.clearProjectDraftThreadId(projectRef);
      if (viewingThisProject) void router.navigate({ to: "/", replace: true });
      return true;
    },
    [deleteProject, router],
  );
}

import type { PullRequestComment, PullRequestDetail } from "@t3tools/contracts";

type EditingSubject = Pick<
  PullRequestDetail,
  "author" | "capabilities" | "viewer" | "viewerPermissions"
>;

function sameLogin(one: string | null | undefined, other: string | null | undefined): boolean {
  if (one == null || other == null) return false;
  return one.trim().toLowerCase() === other.trim().toLowerCase();
}

export function canEditPullRequestChangeRequest(detail: EditingSubject): boolean {
  if (detail.capabilities.edit?.changeRequest !== true) return false;
  return (
    sameLogin(detail.viewer, detail.author?.login) ||
    detail.viewerPermissions.actions.includes("merge")
  );
}

export function canEditPullRequestComment(
  detail: EditingSubject,
  comment: Pick<PullRequestComment, "author" | "kind">,
): boolean {
  if (detail.capabilities.edit?.comment !== true) return false;
  if (comment.kind !== "issue-comment" && comment.kind !== "review-comment") return false;
  return sameLogin(detail.viewer, comment.author?.login);
}

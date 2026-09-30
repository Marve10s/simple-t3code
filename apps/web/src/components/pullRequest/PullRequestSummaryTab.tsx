import type {
  EnvironmentId,
  PullRequestComment,
  PullRequestDetailView,
  PullRequestRef,
  PullRequestReviewThread,
  ScopedThreadRef,
} from "@t3tools/contracts";
import {
  ArrowDownUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  HammerIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { useAtomCommand } from "~/state/use-atom-command";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { cn } from "~/lib/utils";
import { useOpenLink } from "~/browser/useOpenLink";
import { formatRelativeTimeLabel } from "~/timestampFormat";

import { Button } from "../ui/button";
import { PullRequestEditButton } from "./PullRequestEditButton";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  PullRequestActorLabel,
  PullRequestCheckStatusIcon,
  pullRequestCheckStatusLabel,
  PullRequestLabelChip,
  PullRequestReviewOutcomeBadge,
  pullRequestReviewOutcomeLabel,
  pullRequestReviewOutcomeRingClassName,
  pullRequestReviewOutcomeStaleLabel,
} from "./pullRequestPresentation";
import { PullRequestLabelPicker } from "./PullRequestLabelPicker";
import { PullRequestReviewerPicker } from "./PullRequestReviewerPicker";
import { PullRequestActivityUnavailableState } from "./PullRequestActivityUnavailableState";
import {
  latestPullRequestReviewOutcomes,
  orderPullRequestComments,
  pullRequestFindingKey,
  pullRequestReviewOutcome,
  visibleBody,
  type PullRequestFinding,
} from "./pullRequestDetail.logic";
import {
  canEditPullRequestChangeRequest,
  canEditPullRequestComment,
} from "./pullRequestEditing.logic";
import { PullRequestMarkdown } from "./PullRequestMarkdown";
import { PullRequestCommentBody } from "./PullRequestCommentBody";
import { PullRequestMarkdownEditor } from "./PullRequestMarkdownEditor";
import { PullRequestReactionBar } from "./PullRequestReactions";
import { PullRequestConversationGhost } from "./PullRequestGhosts";
import { sectionCollapseAnchorScrollTop } from "./pullRequestSummaryScroll.logic";

function reviewerKey(login: string): string {
  return login.toLowerCase();
}

function CommentIdentity({
  comment,
  detail,
}: {
  comment: PullRequestComment;
  detail: PullRequestDetailView;
}) {
  const actor = comment.author;
  const profileUrl =
    detail.provider === "github" && actor && !actor.login.endsWith("[bot]")
      ? new URL(`/${encodeURIComponent(actor.login)}`, detail.url).toString()
      : null;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <PullRequestActorLabel actor={actor} profileUrl={profileUrl} className="max-w-full" />
      <Tooltip>
        <TooltipTrigger
          render={
            comment.url ? (
              <a
                href={comment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground hover:underline"
              />
            ) : (
              <span className="text-muted-foreground" />
            )
          }
        >
          <time dateTime={comment.createdAt}>{formatRelativeTimeLabel(comment.createdAt)}</time>
        </TooltipTrigger>
        <TooltipPopup>
          {new Date(comment.createdAt).toLocaleString()}
          {comment.url ? " · Open comment on host" : ""}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

function CommentLocation({
  comment,
  thread,
}: {
  comment: PullRequestComment;
  thread: PullRequestReviewThread | undefined;
}) {
  const path = thread?.path ?? comment.path;
  if (!path) return null;
  const label = `${path}${thread?.line ? `:${thread.line}` : ""}`;
  return (
    <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <Tooltip>
        <TooltipTrigger render={<span className="truncate font-mono" />}>{label}</TooltipTrigger>
        <TooltipPopup>{label}</TooltipPopup>
      </Tooltip>
      {thread?.isOutdated ? <span className="shrink-0">Outdated</span> : null}
    </div>
  );
}

function reviewStateLabel(state: string): string {
  const words = state.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface CommentEditing {
  readonly cwd: string;
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  readonly canEdit: (comment: PullRequestComment) => boolean;
  readonly editingId: string | null;
  readonly saving: boolean;
  readonly onEdit: (comment: PullRequestComment | null) => void;
  readonly onSave: (comment: PullRequestComment, body: string) => void;
}

function CommentBody({
  comment,
  editing,
  className,
}: {
  comment: PullRequestComment;
  editing: CommentEditing;
  className?: string | undefined;
}) {
  if (editing.editingId === comment.id) {
    return (
      <PullRequestMarkdownEditor
        className={className}
        value={comment.body}
        cwd={editing.cwd}
        environmentId={editing.environmentId}
        threadRef={editing.threadRef}
        label="Edit comment"
        saving={editing.saving}
        onSave={(body) => editing.onSave(comment, body)}
        onCancel={() => editing.onEdit(null)}
      />
    );
  }
  return (
    <div className={cn("flex items-start gap-1", className)}>
      <PullRequestCommentBody
        key={comment.id}
        className="min-w-0 flex-1"
        text={comment.body}
        cwd={editing.cwd}
        environmentId={editing.environmentId}
        threadRef={editing.threadRef}
      />
      {editing.canEdit(comment) ? (
        <PullRequestEditButton aria-label="Edit comment" onClick={() => editing.onEdit(comment)} />
      ) : null}
    </div>
  );
}

function CollapsedComment({
  comment,
  editing,
  label,
  body,
  reactionBar,
  detail,
  thread,
}: {
  comment: PullRequestComment;
  editing: CommentEditing;
  label: string;
  body: string | null;
  reactionBar: ReactNode;
  detail: PullRequestDetailView;
  thread: PullRequestReviewThread | undefined;
}) {
  const [open, setOpen] = useState(false);
  const statusTriggerRef = useRef<HTMLButtonElement>(null);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <article className="group rounded-lg border border-border/60 [contain-intrinsic-block-size:44px] [content-visibility:auto]">
        <div className="p-3">
          <div className="flex flex-wrap items-start gap-2">
            <CommentIdentity comment={comment} detail={detail} />
            <CollapsibleTrigger
              ref={statusTriggerRef}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {label}
              <ChevronDownIcon
                aria-hidden
                className={cn("size-3.5 transition-transform", open && "rotate-180")}
              />
            </CollapsibleTrigger>
            {reactionBar}
          </div>
          <CommentLocation comment={comment} thread={thread} />
          {!open && body ? (
            <CollapsibleTrigger
              className="mt-2 block w-full truncate text-left text-xs text-muted-foreground hover:text-foreground"
              onClick={() => statusTriggerRef.current?.focus({ preventScroll: true })}
            >
              {body
                .replace(/<!--[\s\S]*?-->/gu, "")
                .replace(/^\s*>?\s*\[!\w+\]\s*$/gmu, "")
                .replace(/!?(\[([^\]]+)\])\([^)]*\)/gu, "$2")
                .replace(/^[\s>#*-]+/gmu, "")
                .replace(/[*`]/gu, "")
                .replace(/\s+/g, " ")
                .trim()}
            </CollapsibleTrigger>
          ) : null}
        </div>
        <CollapsiblePanel>
          {open ? (
            <div className="px-3 pb-3">
              {body === null && !editing.canEdit(comment) ? null : (
                <CommentBody className="mt-2" comment={comment} editing={editing} />
              )}
            </div>
          ) : null}
        </CollapsiblePanel>
      </article>
    </Collapsible>
  );
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-7 min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 text-xs sm:min-h-6">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="min-w-0 text-foreground">{children}</span>
    </div>
  );
}

function Section({
  title,
  defaultOpen = true,
  keepMounted = false,
  actions,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  keepMounted?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const headingRef = useRef<HTMLDivElement>(null);
  const setOpenWithScrollAnchor = (nextOpen: boolean) => {
    if (!nextOpen) {
      const heading = headingRef.current;
      const section = heading?.closest<HTMLElement>("[data-pull-request-summary-section]");
      const scroller = heading?.closest<HTMLElement>("[data-pull-request-summary-scroll]");
      if (heading && section && scroller) {
        const target = sectionCollapseAnchorScrollTop({
          scrollTop: scroller.scrollTop,
          viewportTop: scroller.getBoundingClientRect().top,
          sectionTop: section.getBoundingClientRect().top,
          headingTop: heading.getBoundingClientRect().top,
        });
        if (target !== null) scroller.scrollTop = target;
      }
    }
    setOpen(nextOpen);
  };
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpenWithScrollAnchor}
      render={<section aria-label={title} />}
      data-pull-request-summary-section
    >
      <div
        ref={headingRef}
        className="sticky top-0 z-10 flex w-full items-center bg-background pr-4"
      >
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 px-4 py-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
          <span>{title}</span>
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "size-3.5 text-muted-foreground/60 transition-transform",
              open && "rotate-90",
            )}
          />
        </CollapsibleTrigger>
        {actions}
      </div>
      <CollapsiblePanel keepMounted={keepMounted}>
        <div className="px-4 pb-4">{children}</div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function CommentGroup({
  label,
  comments,
  detail,
  children,
  onOpenChange,
}: {
  label: string;
  comments: readonly PullRequestComment[];
  detail: PullRequestDetailView;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const authors = [
    ...new Map(
      comments.map((comment) => [reviewerKey(comment.author?.login ?? "ghost"), comment.author]),
    ).values(),
  ];
  const fileCount = new Set(comments.flatMap((comment) => (comment.path ? [comment.path] : [])))
    .size;
  const latest = comments.reduce<string | null>(
    (date, comment) => (date === null || comment.createdAt > date ? comment.createdAt : date),
    null,
  );
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <Collapsible onOpenChange={onOpenChange}>
        <div className="flex items-center gap-3 pl-3">
          <div className="flex shrink-0 -space-x-1.5">
            {authors.slice(0, 3).map((actor) => (
              <span
                key={actor?.login ?? "ghost"}
                className="relative flex rounded-full ring-2 ring-background hover:z-10 focus-within:z-10"
              >
                <PullRequestActorLabel
                  actor={actor}
                  profileUrl={
                    detail.provider === "github" && actor
                      ? new URL(
                          actor.isBot || actor.login.endsWith("[bot]")
                            ? `/apps/${encodeURIComponent(actor.login.replace(/\[bot\]$/, ""))}`
                            : `/${encodeURIComponent(actor.login)}`,
                          detail.url,
                        ).toString()
                      : null
                  }
                  variant="avatar"
                />
              </span>
            ))}
            {authors.length > 3 ? (
              <span className="relative flex size-6 items-center justify-center rounded-full bg-muted text-3xs text-muted-foreground ring-2 ring-background">
                +{authors.length - 3}
              </span>
            ) : null}
          </div>
          <CollapsibleTrigger
            aria-label={label}
            className="group flex min-w-0 flex-1 items-center gap-3 rounded-md py-3 pr-3 text-left hover:bg-muted/30"
          >
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block text-xs font-medium text-foreground/90">{label}</span>
              <span className="flex flex-wrap gap-x-1.5 text-2xs text-muted-foreground">
                <span>
                  {authors.length} {authors.length === 1 ? "author" : "authors"}
                </span>
                {fileCount > 0 ? (
                  <span>
                    · {fileCount} {fileCount === 1 ? "file" : "files"}
                  </span>
                ) : null}
                {latest ? (
                  <span>
                    · Latest{" "}
                    <Tooltip>
                      <TooltipTrigger render={<time dateTime={latest} />}>
                        {formatRelativeTimeLabel(latest)}
                      </TooltipTrigger>
                      <TooltipPopup>{new Date(latest).toLocaleString()}</TooltipPopup>
                    </Tooltip>
                  </span>
                ) : null}
              </span>
            </span>
            <ChevronRightIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-90"
            />
          </CollapsibleTrigger>
        </div>
        <CollapsiblePanel keepMounted>
          <div className="border-t border-border/60 px-3 pb-3">{children}</div>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  );
}

const COMMENT_PAGE = 10;

export function PullRequestSummaryTab({
  environmentId,
  threadRef,
  reference,
  detail,
  activityPending,
  checksStale = false,
  activityError,
  pendingFinding,
  fixFindingLabel = "Fix in a thread",
  fixCheckLabel = "Fix",
  onFixFinding,
  onRefresh,
  onRefreshChecks = onRefresh,
}: {
  environmentId: EnvironmentId;
  threadRef: ScopedThreadRef | null;
  reference: PullRequestRef;
  detail: PullRequestDetailView;
  activityPending: boolean;
  checksStale?: boolean;
  activityError: string | null;
  pendingFinding?: string | null;
  fixFindingLabel?: string;
  fixCheckLabel?: string;
  onFixFinding?: (finding: PullRequestFinding) => void;
  onRefresh: () => void;
  onRefreshChecks?: () => void;
}) {
  const [shown, setShown] = useState({ url: detail.url, count: COMMENT_PAGE });
  const [openedBotGroup, setOpenedBotGroup] = useState<string | null>(null);
  const [shownBots, setShownBots] = useState({ url: detail.url, count: COMMENT_PAGE });
  const shownBotComments = shownBots.url === detail.url ? shownBots.count : COMMENT_PAGE;
  const shownComments = shown.url === detail.url ? shown.count : COMMENT_PAGE;
  const threadByCommentId = new Map(
    detail.reviewThreads.flatMap((thread) =>
      thread.comments.map((comment) => [comment.id, thread] as const),
    ),
  );

  const activeComments: PullRequestComment[] = [];
  const finishedComments: PullRequestComment[] = [];
  const botComments: PullRequestComment[] = [];
  for (const comment of detail.comments) {
    const finished =
      threadByCommentId.get(comment.id)?.isResolved ||
      pullRequestReviewOutcome(comment.reviewState) === "dismissed";
    const bot = comment.author?.isBot === true || comment.author?.login.endsWith("[bot]");
    (finished ? finishedComments : bot ? botComments : activeComments).push(comment);
  }
  const recentComments = activeComments.slice(Math.max(0, activeComments.length - shownComments));
  const hiddenCommentCount = activeComments.length - recentComments.length;
  const recentBotComments = botComments.slice(Math.max(0, botComments.length - shownBotComments));
  const hiddenBotCommentCount = botComments.length - recentBotComments.length;
  const [commentOrder, setCommentOrder] = useState<"newest" | "oldest">("newest");
  const visibleComments = orderPullRequestComments(recentComments, commentOrder);
  const showOldestCommentsButton =
    hiddenCommentCount > 0 ? (
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => setShown({ url: detail.url, count: shownComments + COMMENT_PAGE })}
      >
        Show {Math.min(hiddenCommentCount, COMMENT_PAGE)} older comment
        {hiddenCommentCount === 1 ? "" : "s"} ({hiddenCommentCount} hidden)
      </Button>
    ) : null;
  const reviewOutcomes = latestPullRequestReviewOutcomes(detail.comments, detail.commits);
  const outcomeByLogin = new Map(
    reviewOutcomes.flatMap((entry) =>
      entry.actor ? [[reviewerKey(entry.actor.login), entry] as const] : [],
    ),
  );
  const reviewerEntries = [
    ...detail.reviewers.map((actor) => ({
      key: actor.login,
      actor,
      outcome: outcomeByLogin.get(reviewerKey(actor.login))?.outcome ?? null,
      stale: outcomeByLogin.get(reviewerKey(actor.login))?.stale ?? false,
    })),
    ...reviewOutcomes
      .filter(
        (entry) =>
          !detail.reviewers.some(
            (actor) =>
              entry.actor !== null && reviewerKey(actor.login) === reviewerKey(entry.actor.login),
          ),
      )
      .map((entry) => ({
        key: entry.key,
        actor: entry.actor,
        outcome: entry.outcome,
        stale: entry.stale,
      })),
  ];

  const openLink = useOpenLink(threadRef);
  const openCheck = (url: string) => {
    void openLink(url).catch((error: unknown) => {
      console.error(error);
      toastManager.add({ type: "error", title: "Unable to open check details" });
    });
  };

  const update = useAtomCommand(pullRequestEnvironment.update, { reportFailure: false });
  const updateComment = useAtomCommand(pullRequestEnvironment.updateComment, {
    reportFailure: false,
  });
  const [bodyScope, setBodyScope] = useState<string | null>(null);
  const [bodySaving, setBodySaving] = useState(false);
  const [commentScope, setCommentScope] = useState<{
    readonly pullRequest: string;
    readonly commentId: string;
  } | null>(null);
  const [commentSaving, setCommentSaving] = useState(false);
  const editingCommentId = commentScope?.pullRequest === detail.url ? commentScope.commentId : null;

  const saveBody = async (body: string) => {
    if (bodySaving) return;
    setBodySaving(true);
    const result = await update({ environmentId, input: { ...reference, body } });
    setBodySaving(false);
    if (result._tag === "Failure") {
      toastManager.add({ type: "error", title: "Could not save the description" });
      return;
    }
    setBodyScope(null);
    onRefresh();
  };

  const commentEditing: CommentEditing = {
    cwd: detail.workspaceRoot,
    environmentId,
    threadRef,
    canEdit: (comment) => canEditPullRequestComment(detail, comment),
    editingId: editingCommentId,
    saving: commentSaving,
    onEdit: (comment) =>
      setCommentScope(comment === null ? null : { pullRequest: detail.url, commentId: comment.id }),
    onSave: async (comment, body) => {
      if (commentSaving || comment.kind === "review") return;
      setCommentSaving(true);
      const result = await updateComment({
        environmentId,
        input: { ...reference, commentId: comment.id, kind: comment.kind, body },
      });
      setCommentSaving(false);
      if (result._tag === "Failure") {
        toastManager.add({ type: "error", title: "Could not save the comment" });
        return;
      }
      setCommentScope(null);
      onRefresh();
    },
  };

  const renderComment = (comment: PullRequestComment) => {
    const thread = threadByCommentId.get(comment.id);
    const body = visibleBody(comment.body);
    const outcome = pullRequestReviewOutcome(comment.reviewState);
    const finding: PullRequestFinding | null =
      (comment.kind !== "review" && comment.kind !== "review-comment") || outcome === "approved"
        ? null
        : thread === undefined
          ? body === null
            ? null
            : { kind: "comment", comment }
          : { kind: "thread", thread };
    const reactionBar = (
      <PullRequestReactionBar
        reactions={comment.reactions ?? []}
        canReact={detail.capabilities.reactions === true}
        subjectId={comment.id}
        environmentId={environmentId}
        reference={reference}
        onRefresh={onRefresh}
        className="ml-auto justify-end"
      />
    );
    return (
      <article
        key={`${detail.url}:${comment.id}`}
        className="group rounded-lg border border-border/60 bg-background [contain-intrinsic-block-size:160px] [content-visibility:auto]"
      >
        <div className="flex flex-wrap items-start gap-2 rounded-t-lg bg-muted/25 px-3 py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <CommentIdentity comment={comment} detail={detail} />
            {outcome ? (
              <PullRequestReviewOutcomeBadge outcome={outcome} />
            ) : comment.reviewState ? (
              <span>{reviewStateLabel(comment.reviewState)}</span>
            ) : null}
          </div>
          {onFixFinding && finding ? (
            <Button
              size="xs"
              variant="ghost"
              className="-mt-1 shrink-0"
              disabled={pendingFinding !== null && pendingFinding !== undefined}
              onClick={() => onFixFinding(finding)}
            >
              <HammerIcon className="size-3" />
              {pendingFinding === pullRequestFindingKey(finding) ? "Preparing..." : fixFindingLabel}
            </Button>
          ) : null}
          {reactionBar}
        </div>
        <div className="px-3">
          <CommentLocation comment={comment} thread={thread} />
        </div>
        {body === null && !commentEditing.canEdit(comment) ? null : (
          <CommentBody className="px-3 py-3" comment={comment} editing={commentEditing} />
        )}
      </article>
    );
  };

  return (
    <div className="h-full overflow-y-auto" data-pull-request-summary-scroll>
      <section className="px-4 pt-2.5 pb-1">
        <div className="space-y-2">
          <MetaRow icon={<UsersIcon className="size-3.5" />} label="Reviewers">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              {reviewerEntries.length === 0 ? (
                <span className="text-muted-foreground">None</span>
              ) : (
                <span className="flex items-center -space-x-1">
                  {reviewerEntries.map((entry) => {
                    const login = entry.actor?.login ?? "ghost";
                    const named =
                      entry.actor?.name && entry.actor.name !== login
                        ? `${entry.actor.name} (@${login})`
                        : login;
                    return (
                      <Tooltip key={entry.key}>
                        <TooltipTrigger
                          render={
                            <span
                              className={cn(
                                "relative rounded-full hover:z-10",
                                entry.outcome
                                  ? pullRequestReviewOutcomeRingClassName(
                                      entry.outcome,
                                      entry.stale,
                                    )
                                  : undefined,
                              )}
                            />
                          }
                        >
                          <PullRequestActorLabel
                            actor={entry.actor}
                            tooltip={false}
                            variant="avatar"
                          />
                          {entry.outcome ? (
                            <span className="sr-only">
                              {entry.stale
                                ? pullRequestReviewOutcomeStaleLabel(entry.outcome)
                                : pullRequestReviewOutcomeLabel(entry.outcome)}
                            </span>
                          ) : null}
                        </TooltipTrigger>
                        <TooltipPopup side="bottom">
                          {entry.outcome
                            ? `${named} — ${
                                entry.stale
                                  ? pullRequestReviewOutcomeStaleLabel(entry.outcome)
                                  : pullRequestReviewOutcomeLabel(entry.outcome)
                              }`
                            : named}
                        </TooltipPopup>
                      </Tooltip>
                    );
                  })}
                </span>
              )}
              {detail.capabilities.reviewers.request &&
              detail.capabilities.reviewers.listCandidates ? (
                <PullRequestReviewerPicker
                  environmentId={environmentId}
                  reference={reference}
                  allowed={detail.viewerPermissions.requestReviewers}
                />
              ) : null}
            </span>
          </MetaRow>
          {detail.labels.length > 0 || detail.capabilities.labels === true ? (
            <MetaRow icon={<TagIcon className="size-3.5" />} label="Labels">
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                {detail.labels.length === 0 ? (
                  <span className="text-muted-foreground">None</span>
                ) : (
                  detail.labels.map((label) => (
                    <PullRequestLabelChip
                      key={label.name}
                      label={label}
                      size="default"
                      className="max-w-48"
                    />
                  ))
                )}
                {detail.capabilities.labels === true ? (
                  <PullRequestLabelPicker
                    environmentId={environmentId}
                    reference={reference}
                    allowed={detail.viewerPermissions.labels !== false}
                  />
                ) : null}
              </span>
            </MetaRow>
          ) : null}
        </div>
      </section>

      <Section key={`description:${detail.url}`} title="Description" keepMounted>
        <div className="group">
          {bodyScope === detail.url ? (
            <PullRequestMarkdownEditor
              allowEmpty
              value={detail.body}
              cwd={detail.workspaceRoot}
              environmentId={environmentId}
              threadRef={threadRef}
              label="Pull request description"
              placeholder="Describe this pull request"
              saving={bodySaving}
              onSave={(body) => void saveBody(body)}
              onCancel={() => setBodyScope(null)}
            />
          ) : (
            <div className="flex items-start gap-1">
              <PullRequestMarkdown
                className="min-w-0 flex-1"
                text={detail.body.trim().length > 0 ? detail.body : "_No description provided._"}
                cwd={detail.workspaceRoot}
                environmentId={environmentId}
                threadRef={threadRef}
              />
              {canEditPullRequestChangeRequest(detail) ? (
                <PullRequestEditButton
                  aria-label="Edit description"
                  onClick={() => setBodyScope(detail.url)}
                />
              ) : null}
            </div>
          )}
        </div>
      </Section>

      <Section key={`checks:${detail.url}`} title="Checks" defaultOpen={false}>
        {checksStale ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Check details are out of date.</span>
            <Button size="xs" variant="ghost" onClick={onRefreshChecks}>
              Refresh
            </Button>
          </div>
        ) : detail.checks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No checks reported.</p>
        ) : (
          detail.checks.map((check, index) => {
            const finding = { kind: "check", check } as const;
            const failing = check.status === "failure" || check.status === "cancelled";
            return (
              <div
                key={`${index}:${check.name}:${check.url ?? ""}`}
                className="group flex items-center gap-2 rounded-md pr-1 hover:bg-accent/60"
              >
                <button
                  type="button"
                  disabled={!check.url}
                  onClick={() => check.url && openCheck(check.url)}
                  className={cn(
                    "flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 text-left text-xs leading-5 [&>svg]:mt-0.5",
                    check.url ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  <PullRequestCheckStatusIcon status={check.status} />
                  <span className="min-w-0 flex-1 wrap-anywhere">{check.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {pullRequestCheckStatusLabel(check)}
                  </span>
                </button>
                {onFixFinding && failing ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="shrink-0"
                    disabled={pendingFinding !== null && pendingFinding !== undefined}
                    onClick={() => onFixFinding(finding)}
                  >
                    <HammerIcon className="size-3" />
                    {pendingFinding === pullRequestFindingKey(finding)
                      ? "Preparing..."
                      : fixCheckLabel}
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </Section>

      <Section
        title={`Comments (${detail.commentCount})`}
        actions={
          <Button
            size="xs"
            variant="ghost-muted"
            className="shrink-0"
            aria-label={
              commentOrder === "newest"
                ? "Show oldest comments first"
                : "Show newest comments first"
            }
            onClick={() => setCommentOrder((value) => (value === "newest" ? "oldest" : "newest"))}
          >
            <ArrowDownUpIcon aria-hidden className="size-3" />
            {commentOrder === "newest" ? "Newest first" : "Oldest first"}
          </Button>
        }
      >
        {activityPending ? (
          <PullRequestConversationGhost />
        ) : activityError ? (
          <PullRequestActivityUnavailableState compact error={activityError} onRetry={onRefresh} />
        ) : (
          <>
            {detail.commentsTruncated ? (
              <p className="mb-2 rounded-md border border-warning/30 bg-warning-surface px-2 py-1.5 text-xs">
                This conversation is longer than this page reads in one go. The most recent{" "}
                {detail.comments.length} are here; open it on the host to read the rest.
              </p>
            ) : null}
            {detail.comments.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">No comments yet.</p>
            ) : (
              <div className="space-y-3">
                {commentOrder === "oldest" ? showOldestCommentsButton : null}
                {visibleComments.map(renderComment)}
                {commentOrder === "newest" ? showOldestCommentsButton : null}
                {shownComments > COMMENT_PAGE ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setShown({ url: detail.url, count: COMMENT_PAGE })}
                  >
                    Show only {COMMENT_PAGE} recent comments
                  </Button>
                ) : null}
                {botComments.length > 0 ? (
                  <CommentGroup
                    key={`bots:${detail.url}`}
                    label={`${botComments.length} bot comment${botComments.length === 1 ? "" : "s"}`}
                    comments={botComments}
                    detail={detail}
                    onOpenChange={(open) => {
                      if (open) setOpenedBotGroup(detail.url);
                    }}
                  >
                    <div className="space-y-3 pt-2">
                      {openedBotGroup === detail.url
                        ? orderPullRequestComments(recentBotComments, commentOrder).map(
                            renderComment,
                          )
                        : null}
                      {hiddenBotCommentCount > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() =>
                            setShownBots({
                              url: detail.url,
                              count: shownBotComments + COMMENT_PAGE,
                            })
                          }
                        >
                          Show {Math.min(hiddenBotCommentCount, COMMENT_PAGE)} older bot comment
                          {hiddenBotCommentCount === 1 ? "" : "s"} ({hiddenBotCommentCount} hidden)
                        </Button>
                      ) : null}
                      {shownBotComments > COMMENT_PAGE ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full"
                          onClick={() => setShownBots({ url: detail.url, count: COMMENT_PAGE })}
                        >
                          Show only {COMMENT_PAGE} recent bot comments
                        </Button>
                      ) : null}
                    </div>
                  </CommentGroup>
                ) : null}
                {finishedComments.length > 0 ? (
                  <CommentGroup
                    key={detail.url}
                    label={`${finishedComments.length} resolved or dismissed comment${finishedComments.length === 1 ? "" : "s"}`}
                    comments={finishedComments}
                    detail={detail}
                  >
                    <div className="space-y-2 pt-2">
                      {orderPullRequestComments(finishedComments, commentOrder).map((comment) => {
                        const thread = threadByCommentId.get(comment.id);
                        return (
                          <CollapsedComment
                            key={comment.id}
                            comment={comment}
                            editing={commentEditing}
                            detail={detail}
                            thread={thread}
                            label={thread?.isResolved ? "Resolved" : "Review dismissed"}
                            body={visibleBody(comment.body)}
                            reactionBar={
                              <PullRequestReactionBar
                                className="ml-auto justify-end"
                                reactions={comment.reactions ?? []}
                                canReact={detail.capabilities.reactions === true}
                                subjectId={comment.id}
                                environmentId={environmentId}
                                reference={reference}
                                onRefresh={onRefresh}
                              />
                            }
                          />
                        );
                      })}
                    </div>
                  </CommentGroup>
                ) : null}
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

import type {
  EnvironmentId,
  PullRequestCheck,
  PullRequestChecksState,
  PullRequestRef,
  ScopedThreadRef,
} from "@t3tools/contracts";

import { useOpenLink } from "~/browser/useOpenLink";
import { cn } from "~/lib/utils";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useEnvironmentQuery } from "~/state/query";

import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import {
  PullRequestCheckStatusIcon,
  pullRequestCheckStatusLabel,
  pullRequestChecksStatePresentation,
  summarizePullRequestChecks,
} from "./pullRequestPresentation";

function LazyChecksBody({
  environmentId,
  reference,
  threadRef,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  threadRef: ScopedThreadRef | null;
}) {
  const detailQuery = useEnvironmentQuery(
    pullRequestEnvironment.detail({ environmentId, input: reference }),
  );
  if (detailQuery.error !== null) {
    return <p className="text-muted-foreground text-xs">{detailQuery.error}</p>;
  }
  if (detailQuery.data === null) {
    return (
      <p className="text-muted-foreground text-xs">
        {detailQuery.isPending ? "Loading checks…" : "No checks reported"}
      </p>
    );
  }
  return <ChecksBody checks={detailQuery.data.checks} threadRef={threadRef} />;
}

function ChecksBody({
  checks,
  threadRef,
}: {
  checks: ReadonlyArray<PullRequestCheck>;
  threadRef: ScopedThreadRef | null;
}) {
  const openLink = useOpenLink(threadRef);
  if (checks.length === 0) {
    return <p className="text-muted-foreground text-xs">No checks reported</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {checks.map((check, index) => (
        <li key={`${index}:${check.name}`} className="flex items-center gap-2 text-xs">
          <PullRequestCheckStatusIcon status={check.status} />
          <Tooltip>
            <TooltipTrigger
              render={<span className="min-w-0 flex-1 truncate">{check.name}</span>}
            />
            <TooltipPopup side="top">{check.description ?? check.name}</TooltipPopup>
          </Tooltip>
          <span className="shrink-0 text-muted-foreground">
            {pullRequestCheckStatusLabel(check)}
          </span>
          {check.url === null ? null : (
            <button
              type="button"
              className="shrink-0 text-primary hover:underline"
              onClick={() => {
                if (!check.url) return;
                void openLink(check.url).catch((error: unknown) => {
                  console.error(error);
                  toastManager.add({ type: "error", title: "Unable to open check details" });
                });
              }}
            >
              Details
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PullRequestChecksPopover({
  checksState,
  checks,
  stale = false,
  environmentId,
  reference,
  threadRef = null,
  className,
}: {
  checksState: PullRequestChecksState;
  checks?: ReadonlyArray<PullRequestCheck>;
  stale?: boolean;
  environmentId?: EnvironmentId;
  reference?: PullRequestRef;
  threadRef?: ScopedThreadRef | null;
  className?: string;
}) {
  const presentation = pullRequestChecksStatePresentation(checksState);
  const summary = checks === undefined || stale ? null : summarizePullRequestChecks(checks);
  return (
    <Popover>
      <PopoverTrigger
        nativeButton={false}
        render={
          <span
            role="button"
            tabIndex={0}
            aria-label={`Checks: ${presentation.label}`}
            className={cn("inline-flex shrink-0 cursor-pointer items-center", className)}
          />
        }
        onClick={(event) => event.stopPropagation()}
      >
        <presentation.Icon aria-hidden className={cn("size-3.5", presentation.toneClassName)} />
      </PopoverTrigger>
      <PopoverPopup align="start" width="md" side="bottom">
        <p className="mb-2 font-medium text-sm">{presentation.label}</p>
        {summary === null ? null : <p className="mb-2 text-muted-foreground text-xs">{summary}</p>}
        {stale ? (
          <p className="text-muted-foreground text-xs">
            Check details are out of date. Refresh the pull request to update them.
          </p>
        ) : checks !== undefined ? (
          <ChecksBody checks={checks} threadRef={threadRef} />
        ) : environmentId !== undefined && reference !== undefined ? (
          <LazyChecksBody
            environmentId={environmentId}
            reference={reference}
            threadRef={threadRef}
          />
        ) : null}
      </PopoverPopup>
    </Popover>
  );
}

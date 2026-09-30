import { CheckIcon } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import type { EnvironmentId, ServerProvider } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";

import { cn } from "~/lib/utils";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { useLocalEnvironmentUpdateGroups } from "./ProviderUpdateLaunchNotification.environments";
import {
  collectProviderUpdateOutcomeSnapshots,
  firstRejectedProviderUpdateMessage,
  getProviderUpdateProgressToastView,
  getProviderUpdateSidebarPillView,
  isTerminalProviderUpdatePhase,
  resolveEnvironmentUpdateRowStatus,
  type LocalEnvironmentUpdateGroup,
  type LocalProviderUpdateOutcome,
  type ProviderUpdateRowStatus,
  type ProviderUpdateRowStatusKind,
  type ProviderUpdateToastView,
} from "./ProviderUpdateLaunchNotification.logic";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

type ProviderUpdateCommandResult = AtomCommandResult<
  { readonly providers: ReadonlyArray<ServerProvider> },
  unknown
>;

function toProviderUpdateOutcome(input: {
  readonly environmentId: EnvironmentId;
  readonly isPrimary: boolean;
  readonly target: {
    readonly driver: ServerProvider["driver"];
    readonly instanceId: ServerProvider["instanceId"];
  };
  readonly result: ProviderUpdateCommandResult;
}): PromiseSettledResult<LocalProviderUpdateOutcome> {
  if (input.result._tag === "Failure") {
    if (isAtomCommandInterrupted(input.result)) {
      return {
        status: "fulfilled",
        value: {
          environmentId: input.environmentId,
          isPrimary: input.isPrimary,
          driver: input.target.driver,
          instanceId: input.target.instanceId,
          provider: null,
        },
      };
    }
    const error = squashAtomCommandFailure(input.result);
    return {
      status: "rejected",
      reason: error instanceof Error ? error : new Error("Provider update failed."),
    };
  }

  const provider =
    input.result.value.providers.find(
      (candidate) => candidate.instanceId === input.target.instanceId,
    ) ?? null;
  return {
    status: "fulfilled",
    value: {
      environmentId: input.environmentId,
      isPrimary: input.isPrimary,
      driver: input.target.driver,
      instanceId: input.target.instanceId,
      provider,
    },
  };
}

const PENDING_EXPIRY_MS = 6 * 60_000;

function rowToneClass(kind: ProviderUpdateRowStatusKind): string {
  switch (kind) {
    case "failed":
      return "text-destructive";
    case "unchanged":
      return "text-warning";
    case "success":
      return "text-success";
    default:
      return "text-muted-foreground";
  }
}

function EnvironmentUpdateRow({
  group,
  status,
  onUpdate,
}: {
  readonly group: LocalEnvironmentUpdateGroup;
  readonly status: ProviderUpdateRowStatus;
  readonly onUpdate: () => void;
}) {
  let trailing: ReactNode;
  switch (status.kind) {
    case "loading":
      trailing = <Spinner size="md" tone="muted" />;
      break;
    case "success":
      trailing = <CheckIcon aria-hidden="true" className="size-4 text-success" />;
      break;
    case "failed":
    case "unchanged":
      trailing = (
        <Button size="xs" variant="outline" onClick={onUpdate}>
          Retry
        </Button>
      );
      break;
    default:
      trailing = (
        <Button size="xs" variant="outline" onClick={onUpdate}>
          Update
        </Button>
      );
      break;
  }

  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">{group.label}</span>
        <span className={cn("truncate text-xs", rowToneClass(status.kind))}>{status.text}</span>
      </div>
      <div className="shrink-0">{trailing}</div>
    </div>
  );
}

export function ProviderUpdateEnvironmentRows({
  onInteract,
}: {
  readonly onInteract?: () => void;
}) {
  const { groups } = useLocalEnvironmentUpdateGroups();
  const updateProvider = useAtomCommand(serverEnvironment.updateProvider, {
    reportFailure: false,
  });
  const groupByEnvironment = useMemo(
    () => new Map(groups.map((group) => [group.environmentId, group] as const)),
    [groups],
  );

  const visibleAfterIsoRef = useRef<string>(new Date().toISOString());

  const inFlightEnvironmentsRef = useRef<Set<EnvironmentId>>(new Set());

  const requestVersionRef = useRef<Map<EnvironmentId, number>>(new Map());

  const [pendingEnvironments, setPendingEnvironments] = useState<ReadonlySet<EnvironmentId>>(
    () => new Set(),
  );
  const [errorByEnvironment, setErrorByEnvironment] = useState<ReadonlyMap<EnvironmentId, string>>(
    () => new Map(),
  );
  const [resultByEnvironment, setResultByEnvironment] = useState<
    ReadonlyMap<EnvironmentId, ProviderUpdateToastView>
  >(() => new Map());

  const clearPending = useCallback((environmentId: EnvironmentId) => {
    setPendingEnvironments((previous) => {
      if (!previous.has(environmentId)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(environmentId);
      return next;
    });
  }, []);

  const handleUpdate = useCallback(
    async (environmentId: EnvironmentId) => {
      const group = groupByEnvironment.get(environmentId);
      if (!group || group.candidates.length === 0) {
        return;
      }
      if (inFlightEnvironmentsRef.current.has(environmentId)) {
        return;
      }
      inFlightEnvironmentsRef.current.add(environmentId);
      const requestVersion = (requestVersionRef.current.get(environmentId) ?? 0) + 1;
      requestVersionRef.current.set(environmentId, requestVersion);
      const isCurrentRequest = () =>
        requestVersionRef.current.get(environmentId) === requestVersion;
      onInteract?.();
      const providerCount = group.candidates.length;
      const targets = group.candidates.map((candidate) => ({
        driver: candidate.driver,
        instanceId: candidate.instanceId,
      }));

      setPendingEnvironments((previous) => new Set(previous).add(environmentId));
      setErrorByEnvironment((previous) => {
        if (!previous.has(environmentId)) {
          return previous;
        }
        const next = new Map(previous);
        next.delete(environmentId);
        return next;
      });
      setResultByEnvironment((previous) => {
        if (!previous.has(environmentId)) {
          return previous;
        }
        const next = new Map(previous);
        next.delete(environmentId);
        return next;
      });

      const expiry = setTimeout(() => {
        if (!isCurrentRequest()) {
          return;
        }
        inFlightEnvironmentsRef.current.delete(environmentId);
        clearPending(environmentId);
        setErrorByEnvironment((previous) =>
          new Map(previous).set(environmentId, "Update timed out — try again."),
        );
      }, PENDING_EXPIRY_MS);
      try {
        const results = await Promise.all(
          targets.map(async (target): Promise<PromiseSettledResult<LocalProviderUpdateOutcome>> => {
            try {
              const result = await updateProvider({
                environmentId,
                input: { provider: target.driver, instanceId: target.instanceId },
              });
              return toProviderUpdateOutcome({
                environmentId,
                isPrimary: group.isPrimary,
                target,
                result,
              });
            } catch (error) {
              return {
                status: "rejected",
                reason: error instanceof Error ? error : new Error("Provider update failed."),
              };
            }
          }),
        );
        if (!isCurrentRequest()) {
          return;
        }
        setErrorByEnvironment((previous) => {
          if (!previous.has(environmentId)) {
            return previous;
          }
          const next = new Map(previous);
          next.delete(environmentId);
          return next;
        });
        if (results.length === 0) {
          setErrorByEnvironment((previous) =>
            new Map(previous).set(
              environmentId,
              "This environment isn’t connected — try again once it reconnects.",
            ),
          );
          return;
        }
        const rejectedMessage = firstRejectedProviderUpdateMessage(results);
        if (rejectedMessage) {
          setErrorByEnvironment((previous) =>
            new Map(previous).set(environmentId, rejectedMessage),
          );
          return;
        }
        const view = getProviderUpdateProgressToastView({
          providers: collectProviderUpdateOutcomeSnapshots(results),
          providerCount,
        });
        if (isTerminalProviderUpdatePhase(view.phase)) {
          setResultByEnvironment((previous) => new Map(previous).set(environmentId, view));
        }
      } catch (error) {
        if (isCurrentRequest()) {
          setErrorByEnvironment((previous) =>
            new Map(previous).set(
              environmentId,
              error instanceof Error ? error.message : "Provider update failed.",
            ),
          );
        }
      } finally {
        clearTimeout(expiry);
        if (isCurrentRequest()) {
          clearPending(environmentId);
          inFlightEnvironmentsRef.current.delete(environmentId);
        }
      }
    },
    [clearPending, groupByEnvironment, onInteract, updateProvider],
  );

  const rows = groups
    .map((group) => ({
      group,
      status: resolveEnvironmentUpdateRowStatus({
        group,
        error: errorByEnvironment.get(group.environmentId),
        result: resultByEnvironment.get(group.environmentId),
        pill: getProviderUpdateSidebarPillView(group.candidates, {
          visibleAfterIso: visibleAfterIsoRef.current,
        }),
        isPending: pendingEnvironments.has(group.environmentId),
      }),
    }))
    .filter(({ group, status }) => group.candidates.length > 0 || status.kind !== "idle");

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-0.5 flex flex-col gap-1">
      {rows.map(({ group, status }) => (
        <EnvironmentUpdateRow
          key={group.environmentId}
          group={group}
          status={status}
          onUpdate={() => handleUpdate(group.environmentId)}
        />
      ))}
    </div>
  );
}

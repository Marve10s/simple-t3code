import {
  requestKindFromRequestType,
  type PendingApproval,
} from "@t3tools/client-runtime/pending-requests";
import { UserInputAttachmentAnswerPayload } from "@t3tools/contracts";
import { foldUserInputActivities } from "@t3tools/client-runtime/work-log/user-input";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Arr from "effect/Array";
import { shallow } from "zustand/vanilla/shallow";
import { isBackgroundTaskActivity } from "@t3tools/client-runtime/state/subagentRuntime";
import {
  commandDetailRepeatsCommand,
  extractCommandOutputText,
  extractWorkLogToolLifecycleStatus,
  isWorktreeSetupActivity,
  workEntryIndicatesToolFailure,
  workEntryIndicatesToolSuccess,
  workLogEntryIsToolLike,
  type WorkLogToolLifecycleStatus,
} from "@t3tools/client-runtime/work-log/presentation";
import { extractToolActivityPresentation } from "@t3tools/client-runtime/work-log/tool-presentation";
import {
  isToolLifecycleItemType,
  type AssetResource,
  type OrchestrationLatestTurn,
  type OrchestrationThreadActivity,
  type OrchestrationProposedPlanId,
  type ToolLifecycleItemType,
  type ThreadId,
  type TurnId,
} from "@t3tools/contracts";

import {
  isImageAttachment,
  type ChatAttachment,
  type ChatMessage,
  type ProposedPlan,
  type SessionPhase,
  type Thread,
  type ThreadSession,
  type TurnDiffSummary,
} from "./types";

export type { PendingApproval, PendingUserInput } from "@t3tools/client-runtime/pending-requests";

export { formatDuration } from "@t3tools/shared/orchestrationTiming";

export {
  workEntryDisplayIndicatesToolFailure,
  workEntryIndicatesToolSuccess,
  workLogEntryIsToolLike,
  type WorkLogToolLifecycleStatus,
} from "@t3tools/client-runtime/work-log/presentation";

export interface WorkLogEntry {
  questionAnswer?: UserInputAttachmentAnswerPayload;
  id: string;
  createdAt: string;
  turnId?: TurnId | null;
  toolCallId?: string;
  label: string;
  detail?: string;
  viewedImagePath?: string;
  command?: string;
  rawCommand?: string;
  changedFiles?: ReadonlyArray<string>;
  tone: "thinking" | "tool" | "info" | "error";
  toolTitle?: string;
  toolSurface?: import("@t3tools/contracts").ToolActivitySurface;
  toolIcon?: import("@t3tools/contracts").ToolActivityIcon;
  toolSource?: import("@t3tools/contracts").ToolActivitySource;
  toolData?: unknown;
  itemType?: ToolLifecycleItemType;
  requestKind?: PendingApproval["requestKind"];
  toolLifecycleStatus?: WorkLogToolLifecycleStatus;
  sourceActivityKind?: OrchestrationThreadActivity["kind"];
  taskId?: string;
  agentRole?: string;
  agentSpawn?: {
    workflowId: string | null;
    agentTaskIds: ReadonlyArray<string>;
  };
}

const workLogCollapseKey = Symbol();

interface DerivedWorkLogEntry extends WorkLogEntry {
  sourceActivityKind: OrchestrationThreadActivity["kind"];
  [workLogCollapseKey]?: string;
  toolCallId?: string;
  isWorkflowCoordinator?: boolean;
  isBackgroundTask?: boolean;
}

const derivedWorkLogEntryByActivity = new WeakMap<
  OrchestrationThreadActivity,
  DerivedWorkLogEntry
>();

export interface ActivePlanState {
  createdAt: string;
  turnId: TurnId | null;
  explanation?: string | null;
  steps: Array<{
    durationMs?: number;
    step: string;
    status: "pending" | "inProgress" | "completed";
  }>;
}

export interface LatestProposedPlanState {
  id: OrchestrationProposedPlanId;
  createdAt: string;
  updatedAt: string;
  turnId: TurnId | null;
  planMarkdown: string;
  implementedAt: string | null;
  implementationThreadId: ThreadId | null;
}

export type TimelineEntry =
  | {
      id: string;
      kind: "message";
      createdAt: string;
      message: ChatMessage;
    }
  | {
      id: string;
      kind: "proposed-plan";
      createdAt: string;
      proposedPlan: ProposedPlan;
    }
  | {
      id: string;
      kind: "work";
      createdAt: string;
      entry: WorkLogEntry;
    };

export interface TimelineEntriesProjection {
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly proposedPlans: ReadonlyArray<ProposedPlan>;
  readonly workEntries: ReadonlyArray<WorkLogEntry>;
  readonly entries: TimelineEntry[];
}

export function workEntrySignalsSevereFailure(entry: WorkLogEntry): boolean {
  return (
    entry.sourceActivityKind === "runtime.error" ||
    entry.sourceActivityKind?.endsWith(".failed") === true
  );
}

export function workEntryIndicatesToolNeutralStatus(entry: WorkLogEntry): boolean {
  if (entry.agentSpawn !== undefined) {
    return false;
  }
  if (!workLogEntryIsToolLike(entry)) {
    return false;
  }
  if (workEntryIndicatesToolFailure(entry)) {
    return false;
  }
  if (workEntryIndicatesToolSuccess(entry)) {
    return false;
  }
  return true;
}

type LatestTurnTiming = Pick<OrchestrationLatestTurn, "turnId" | "startedAt" | "completedAt">;
type SessionActivityState = Pick<NonNullable<Thread["session"]>, "status" | "activeTurnId">;

export function isLatestTurnSettled(
  latestTurn: LatestTurnTiming | null,
  session: SessionActivityState | null,
): boolean {
  if (!latestTurn?.startedAt) return false;
  if (!latestTurn.completedAt) return false;
  if (!session) return true;
  if (session.status === "running") return false;
  return true;
}

export function deriveActiveWorkStartedAt(
  latestTurn: LatestTurnTiming | null,
  session: SessionActivityState | null,
  sendStartedAt: string | null,
  latestUserMessageAt: string | null = null,
): string | null {
  const runningTurnId = session?.status === "running" ? session.activeTurnId : null;
  if (runningTurnId !== null) {
    if (latestTurn?.turnId === runningTurnId) {
      return latestTurn.startedAt ?? sendStartedAt ?? latestUserMessageAt;
    }
    return sendStartedAt ?? latestUserMessageAt;
  }
  if (!isLatestTurnSettled(latestTurn, session)) {
    return latestTurn?.startedAt ?? sendStartedAt;
  }
  return sendStartedAt;
}

function planStateFromActivity(activity: OrchestrationThreadActivity): ActivePlanState | null {
  const payload =
    activity.payload && typeof activity.payload === "object"
      ? (activity.payload as Record<string, unknown>)
      : null;
  const rawPlan = payload?.plan;
  if (!Array.isArray(rawPlan)) {
    return null;
  }
  const steps: Array<{
    step: string;
    status: "pending" | "inProgress" | "completed";
  }> = [];
  for (const entry of rawPlan) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.step !== "string") {
      continue;
    }
    const status =
      record.status === "completed" || record.status === "inProgress" ? record.status : "pending";
    steps.push({
      step: record.step,
      status,
    });
  }
  if (steps.length === 0) {
    return null;
  }
  return {
    createdAt: activity.createdAt,
    turnId: activity.turnId,
    ...(payload && "explanation" in payload
      ? { explanation: payload.explanation as string | null }
      : {}),
    steps,
  };
}

function addPlanStepDurations(
  plan: ActivePlanState,
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ActivePlanState {
  const timings = new Map<string, { completedAt?: number; startedAt?: number }>();
  let planStartedAt: number | undefined;

  const keyedSteps = (steps: ActivePlanState["steps"]) => {
    const occurrences = new Map<string, number>();
    return steps.map((step) => {
      const occurrence = occurrences.get(step.step) ?? 0;
      occurrences.set(step.step, occurrence + 1);
      return { key: `${step.step}:${occurrence}`, step };
    });
  };

  for (const activity of activities) {
    const snapshot = planStateFromActivity(activity);
    const activityAt = Date.parse(activity.createdAt);
    if (!snapshot || Number.isNaN(activityAt)) continue;
    planStartedAt ??= activityAt;

    for (const { key, step } of keyedSteps(snapshot.steps)) {
      const timing = timings.get(key) ?? {};
      if (step.status === "inProgress" && timing.startedAt === undefined) {
        timing.startedAt = activityAt;
      }
      if (step.status === "completed" && timing.completedAt === undefined) {
        timing.completedAt = activityAt;
      }
      timings.set(key, timing);
    }
  }

  const durationByKey = new Map<string, number>();
  let previousCompletedAt = planStartedAt;
  for (const [key, timing] of [...timings.entries()].toSorted(
    (left, right) => (left[1].completedAt ?? Infinity) - (right[1].completedAt ?? Infinity),
  )) {
    const completedAt = timing.completedAt;
    const startedAt = timing.startedAt ?? previousCompletedAt;
    if (completedAt === undefined) continue;
    if (startedAt !== undefined && completedAt > startedAt) {
      durationByKey.set(key, completedAt - startedAt);
    }
    previousCompletedAt = completedAt;
  }

  return {
    ...plan,
    steps: keyedSteps(plan.steps).map(({ key, step }) => {
      if (step.status !== "completed") return step;
      const durationMs = durationByKey.get(key);
      return durationMs === undefined ? step : { ...step, durationMs };
    }),
  };
}

export function deriveActivePlanState(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  latestTurnId: TurnId | undefined,
): ActivePlanState | null {
  const allPlanActivities = activities
    .filter((activity) => activity.kind === "turn.plan.updated")
    .sort(compareActivitiesByOrder);
  const latest = Option.firstSomeOf([
    ...(latestTurnId
      ? Arr.findLast(allPlanActivities, (activity) => activity.turnId === latestTurnId)
      : Option.none()),
    Arr.last(allPlanActivities),
  ]).pipe(Option.getOrNull);
  if (!latest) {
    return null;
  }
  const plan = planStateFromActivity(latest);
  if (!plan) return null;
  const matchingActivities = allPlanActivities.filter(
    (activity) => activity.turnId === latest.turnId,
  );
  const latestClearIndex = matchingActivities.findLastIndex(
    (activity) => planStateFromActivity(activity) === null,
  );
  return addPlanStepDurations(plan, matchingActivities.slice(latestClearIndex + 1));
}

export function findLatestProposedPlan(
  proposedPlans: ReadonlyArray<ProposedPlan>,
  latestTurnId: TurnId | string | null | undefined,
): LatestProposedPlanState | null {
  if (latestTurnId) {
    const matchingTurnPlan = [...proposedPlans]
      .filter((proposedPlan) => proposedPlan.turnId === latestTurnId)
      .toSorted(
        (left, right) =>
          left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
      )
      .at(-1);
    if (matchingTurnPlan) {
      return toLatestProposedPlanState(matchingTurnPlan);
    }
  }

  const latestPlan = [...proposedPlans]
    .toSorted(
      (left, right) =>
        left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
    )
    .at(-1);
  if (!latestPlan) {
    return null;
  }

  return toLatestProposedPlanState(latestPlan);
}

export function hasActionableProposedPlan(
  proposedPlan: LatestProposedPlanState | Pick<ProposedPlan, "implementedAt"> | null,
): boolean {
  return proposedPlan !== null && proposedPlan.implementedAt === null;
}

function isAgentTaskStartedActivity(activity: OrchestrationThreadActivity): boolean {
  const payload =
    activity.payload && typeof activity.payload === "object"
      ? (activity.payload as Record<string, unknown>)
      : null;
  if (!payload || typeof payload.taskId !== "string") {
    return false;
  }
  return !isBackgroundTaskActivity(payload);
}

function isAgentInternalActivity(activity: OrchestrationThreadActivity): boolean {
  const payload =
    activity.payload && typeof activity.payload === "object"
      ? (activity.payload as Record<string, unknown>)
      : null;
  if (!payload) {
    return false;
  }
  const isTaskRow =
    activity.kind === "task.started" ||
    activity.kind === "task.progress" ||
    activity.kind === "task.updated" ||
    activity.kind === "task.completed";
  if (isTaskRow) {
    const ownedByAgent = typeof payload.agentId === "string" && payload.agentId.trim().length > 0;
    if (ownedByAgent || payload.timelineBypass === true) {
      const isAgentTaskRow =
        activity.kind !== "task.updated" &&
        typeof payload.taskId === "string" &&
        !isBackgroundTaskActivity(payload);
      return !isAgentTaskRow;
    }
    return false;
  }
  if (payload.timelineBypass === true) {
    return true;
  }
  return typeof payload.agentId === "string" && payload.agentId.trim().length > 0;
}

export function deriveWorkLogEntries(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): WorkLogEntry[] {
  const ordered = [...activities].toSorted(compareActivitiesByOrder);
  const agentLaunchToolIds = new Set<string>();
  for (const activity of ordered) {
    if (
      (activity.kind === "task.started" ||
        activity.kind === "task.progress" ||
        activity.kind === "task.completed") &&
      isAgentTaskStartedActivity(activity)
    ) {
      const toolUseId = asTrimmedString(asRecord(activity.payload)?.toolUseId);
      if (toolUseId) agentLaunchToolIds.add(toolUseId);
    }
  }
  const entries: DerivedWorkLogEntry[] = [];
  for (const activity of foldUserInputActivities(ordered)) {
    if (
      isWorktreeSetupActivity(activity.kind) &&
      (activity.tone !== "error" || activity.kind === "worktree-setup")
    ) {
      continue;
    }
    if (activity.kind === "tool.started") continue;
    if (activity.kind === "task.started" && !isAgentTaskStartedActivity(activity)) continue;
    if (activity.kind === "task.updated") continue;
    if (activity.kind === "tool.progress") continue;
    if (activity.kind === "context-window.updated") continue;
    if (activity.kind === "turn.plan.updated") continue;
    if (activity.summary === "Checkpoint captured") continue;
    if (isNoContentRuntimeWarning(activity)) continue;
    if (isPlanBoundaryToolActivity(activity)) continue;
    if (isAgentInternalActivity(activity)) continue;
    const entry = toDerivedWorkLogEntry(activity);
    if (
      activity.kind === "tool.updated" &&
      entry.itemType === "collab_agent_tool_call" &&
      entry.toolLifecycleStatus === "inProgress" &&
      entry.tone !== "error"
    ) {
      const toolName = asRecord(asRecord(activity.payload)?.data)?.toolName;
      if (toolName === "Agent" || toolName === "Task") continue;
    }
    if (
      (activity.kind === "tool.updated" || activity.kind === "tool.completed") &&
      entry.toolCallId &&
      agentLaunchToolIds.has(entry.toolCallId) &&
      entry.tone !== "error" &&
      entry.toolLifecycleStatus !== "failed"
    ) {
      continue;
    }
    entries.push(entry);
  }
  return collapseDerivedWorkLogEntries(entries);
}

function isNoContentRuntimeWarning(activity: OrchestrationThreadActivity): boolean {
  return (
    activity.kind === "runtime.warning" &&
    activity.summary.endsWith("(no displayable text content)")
  );
}

function isPlanBoundaryToolActivity(activity: OrchestrationThreadActivity): boolean {
  if (activity.kind !== "tool.updated" && activity.kind !== "tool.completed") {
    return false;
  }

  const payload =
    activity.payload && typeof activity.payload === "object"
      ? (activity.payload as Record<string, unknown>)
      : null;
  return typeof payload?.detail === "string" && payload.detail.startsWith("ExitPlanMode:");
}

const decodeQuestionAttachmentAnswer = Schema.decodeUnknownOption(UserInputAttachmentAnswerPayload);

function toDerivedWorkLogEntry(activity: OrchestrationThreadActivity): DerivedWorkLogEntry {
  const cachedEntry = derivedWorkLogEntryByActivity.get(activity);
  if (cachedEntry) {
    return cachedEntry;
  }
  const payload =
    activity.payload && typeof activity.payload === "object"
      ? (activity.payload as Record<string, unknown>)
      : null;
  const commandPreview = extractToolCommand(payload);
  const changedFiles = extractChangedFiles(payload);
  const title = extractToolTitle(payload);
  const toolPresentation = extractToolActivityPresentation(payload);
  const isTaskActivity =
    activity.kind === "task.started" ||
    activity.kind === "task.progress" ||
    activity.kind === "task.completed";
  const taskSummary =
    isTaskActivity && typeof payload?.summary === "string" && payload.summary.length > 0
      ? payload.summary
      : null;
  const taskDetailAsLabel =
    isTaskActivity &&
    !taskSummary &&
    typeof payload?.detail === "string" &&
    payload.detail.length > 0
      ? payload.detail
      : null;
  const taskLabel = taskSummary || taskDetailAsLabel;
  const detail = isTaskActivity
    ? !taskDetailAsLabel &&
      payload &&
      typeof payload.detail === "string" &&
      payload.detail.length > 0
      ? stripTrailingExitCode(payload.detail).output
      : null
    : extractToolDetail(payload, title ?? activity.summary);
  const toolCallId = isTaskActivity ? null : extractToolCallId(payload);
  const entry: DerivedWorkLogEntry = {
    id: activity.id,
    createdAt: activity.createdAt,
    turnId: activity.turnId,
    label: taskLabel || activity.summary,
    tone:
      activity.kind === "task.progress"
        ? "thinking"
        : activity.tone === "approval"
          ? "info"
          : activity.tone,
    sourceActivityKind: activity.kind,
  };
  if (activity.kind === "user-input.answer-submitted") {
    const answer = decodeQuestionAttachmentAnswer(payload);
    if (Option.isSome(answer)) entry.questionAnswer = answer.value;
  }
  const itemType = extractWorkLogItemType(payload);
  const requestKind = extractWorkLogRequestKind(payload);
  const viewedImagePath = asTrimmedString(asRecord(payload?.data)?.imagePath);
  if (detail) {
    entry.detail = detail;
  } else if (activity.kind === "runtime.error" || activity.kind === "runtime.warning") {
    const message = asTrimmedString(payload?.message);
    if (
      message &&
      normalizePreviewForComparison(message) !== normalizePreviewForComparison(activity.summary)
    ) {
      entry.detail = message;
    }
  }
  if (viewedImagePath) {
    entry.viewedImagePath = viewedImagePath;
  }
  if (commandPreview.command) {
    entry.command = commandPreview.command;
  }
  if (commandPreview.rawCommand) {
    entry.rawCommand = commandPreview.rawCommand;
  }
  if (changedFiles.length > 0) {
    entry.changedFiles = changedFiles;
  }
  if (title) {
    entry.toolTitle = title;
  }
  if (toolPresentation.toolSurface) {
    entry.toolSurface = toolPresentation.toolSurface;
  }
  if (toolPresentation.toolIcon) {
    entry.toolIcon = toolPresentation.toolIcon;
  }
  if (toolPresentation.toolSource) {
    entry.toolSource = toolPresentation.toolSource;
  }
  if (itemType === "mcp_tool_call") {
    const data = asRecord(payload?.data);
    const toolData = typeof data?.toolName === "string" ? (data.item ?? data) : data?.item;
    if (toolData !== undefined) {
      entry.toolData = toolData;
    }
  }
  if (itemType) {
    entry.itemType = itemType;
  }
  if (requestKind) {
    entry.requestKind = requestKind;
  }
  if (toolCallId) {
    entry.toolCallId = toolCallId;
  }
  let toolLifecycleStatus = extractWorkLogToolLifecycleStatus(payload);
  if (!toolLifecycleStatus && activity.kind === "tool.completed") {
    toolLifecycleStatus = "completed";
  }
  if (toolLifecycleStatus) {
    entry.toolLifecycleStatus = toolLifecycleStatus;
  }
  if (isTaskActivity && typeof payload?.taskId === "string" && payload.taskId.length > 0) {
    entry.taskId = payload.taskId;
  }
  if (isTaskActivity && typeof payload?.role === "string" && payload.role.length > 0) {
    entry.agentRole = payload.role;
  }
  if (
    isTaskActivity &&
    (payload?.taskType === "local_workflow" ||
      (typeof payload?.workflowName === "string" && payload.workflowName.length > 0))
  ) {
    entry.isWorkflowCoordinator = true;
  }
  if (isTaskActivity && payload && isBackgroundTaskActivity(payload)) {
    entry.isBackgroundTask = true;
  }
  const collapseKey = deriveToolLifecycleCollapseKey(entry);
  if (collapseKey) {
    entry[workLogCollapseKey] = collapseKey;
  }
  derivedWorkLogEntryByActivity.set(activity, entry);
  return entry;
}

function agentSpawnGroupKey(entry: DerivedWorkLogEntry): string {
  const taskId = entry.taskId ?? "";
  const workflowSlot = taskId.indexOf(":wf:");
  if (workflowSlot !== -1) {
    return `wf:${taskId.slice(0, workflowSlot)}`;
  }
  if (entry.agentSpawn?.workflowId) {
    return `wf:${entry.agentSpawn.workflowId}`;
  }
  if (entry.isWorkflowCoordinator) {
    return `wf:${taskId}`;
  }
  return entry.turnId ? `direct:${entry.turnId}` : `direct:task:${taskId}`;
}

function toolLifecycleCollapseMapKey(entry: DerivedWorkLogEntry): string | undefined {
  if (
    entry.sourceActivityKind !== "tool.updated" &&
    entry.sourceActivityKind !== "tool.completed"
  ) {
    return undefined;
  }
  return entry.toolCallId ? `tool:${entry.turnId ?? "no-turn"}:${entry.toolCallId}` : undefined;
}

function collapseDerivedWorkLogEntries(
  entries: ReadonlyArray<DerivedWorkLogEntry>,
): DerivedWorkLogEntry[] {
  const collapsed: DerivedWorkLogEntry[] = [];
  const spawnRowIndex = new Map<string, number>();
  const groupKeyByTaskId = new Map<string, string>();
  const toolLifecycleRowIndex = new Map<string, number>();
  for (const entry of entries) {
    const isTaskRow =
      entry.taskId !== undefined &&
      !entry.isBackgroundTask &&
      (entry.sourceActivityKind === "task.started" ||
        entry.sourceActivityKind === "task.progress" ||
        entry.sourceActivityKind === "task.completed");
    if (isTaskRow && entry.taskId !== undefined) {
      const rememberedKey = groupKeyByTaskId.get(entry.taskId);
      const groupKey = rememberedKey ?? agentSpawnGroupKey(entry);
      if (rememberedKey === undefined) {
        groupKeyByTaskId.set(entry.taskId, groupKey);
      }
      const workflowId = groupKey.startsWith("wf:") ? groupKey.slice(3) : null;
      const existingIndex = spawnRowIndex.get(groupKey);
      if (existingIndex !== undefined) {
        const existing = collapsed[existingIndex]!;
        const agentTaskIds = existing.agentSpawn?.agentTaskIds.includes(entry.taskId)
          ? existing.agentSpawn.agentTaskIds
          : [...(existing.agentSpawn?.agentTaskIds ?? []), entry.taskId];
        collapsed[existingIndex] = {
          ...mergeDerivedWorkLogEntries(existing, entry),
          id: existing.id,
          createdAt: existing.createdAt,
          turnId: existing.turnId ?? null,
          ...(existing.taskId !== undefined ? { taskId: existing.taskId } : {}),
          label: existing.label,
          agentSpawn: { workflowId, agentTaskIds },
        };
        continue;
      }
      spawnRowIndex.set(groupKey, collapsed.length);
      collapsed.push({
        ...entry,
        agentSpawn: { workflowId, agentTaskIds: [entry.taskId] },
      });
      continue;
    }
    const lifecycleKey = toolLifecycleCollapseMapKey(entry);
    if (lifecycleKey !== undefined) {
      const matchingLifecycleIndex = toolLifecycleRowIndex.get(lifecycleKey);
      const matchingEntry =
        matchingLifecycleIndex === undefined ? undefined : collapsed[matchingLifecycleIndex];
      if (
        matchingLifecycleIndex !== undefined &&
        matchingEntry &&
        shouldCollapseToolLifecycleEntries(matchingEntry, entry)
      ) {
        collapsed[matchingLifecycleIndex] = mergeDerivedWorkLogEntries(matchingEntry, entry);
        continue;
      }
      toolLifecycleRowIndex.delete(lifecycleKey);
    }
    const previous = collapsed.at(-1);
    if (previous && shouldCollapseToolLifecycleEntries(previous, entry)) {
      const previousIndex = collapsed.length - 1;
      const previousKey = toolLifecycleCollapseMapKey(previous);
      if (previousKey !== undefined) toolLifecycleRowIndex.delete(previousKey);
      const merged = mergeDerivedWorkLogEntries(previous, entry);
      collapsed[previousIndex] = merged;
      const mergedKey = toolLifecycleCollapseMapKey(merged);
      if (mergedKey !== undefined) toolLifecycleRowIndex.set(mergedKey, previousIndex);
      continue;
    }
    collapsed.push(entry);
    if (lifecycleKey !== undefined) {
      toolLifecycleRowIndex.set(lifecycleKey, collapsed.length - 1);
    }
  }
  return collapsed;
}

function shouldCollapseToolLifecycleEntries(
  previous: DerivedWorkLogEntry,
  next: DerivedWorkLogEntry,
): boolean {
  if (
    previous.sourceActivityKind !== "tool.updated" &&
    previous.sourceActivityKind !== "tool.completed"
  ) {
    return false;
  }
  if (next.sourceActivityKind !== "tool.updated" && next.sourceActivityKind !== "tool.completed") {
    return false;
  }
  if (previous.turnId !== next.turnId) {
    return false;
  }
  if (previous.sourceActivityKind === "tool.completed") {
    return false;
  }
  if (
    previous[workLogCollapseKey] !== undefined &&
    previous[workLogCollapseKey] === next[workLogCollapseKey]
  ) {
    return true;
  }
  return (
    previous.toolCallId !== undefined &&
    next.toolCallId === undefined &&
    previous.itemType === next.itemType &&
    normalizeCompactToolLabel(previous.toolTitle ?? previous.label) ===
      normalizeCompactToolLabel(next.toolTitle ?? next.label)
  );
}

function mergeDerivedWorkLogEntries(
  previous: DerivedWorkLogEntry,
  next: DerivedWorkLogEntry,
): DerivedWorkLogEntry {
  const changedFiles = mergeChangedFiles(previous.changedFiles, next.changedFiles);
  const detail = next.detail ?? previous.detail;
  const viewedImagePath = next.viewedImagePath ?? previous.viewedImagePath;
  const command = next.command ?? previous.command;
  const rawCommand = next.rawCommand ?? previous.rawCommand;
  const toolTitle = next.toolTitle ?? previous.toolTitle;
  const toolSurface = next.toolSurface ?? previous.toolSurface;
  const toolIcon = next.toolIcon ?? previous.toolIcon;
  const toolSource = next.toolSource ?? previous.toolSource;
  const itemType = next.itemType ?? previous.itemType;
  const requestKind = next.requestKind ?? previous.requestKind;
  const collapseKey = next[workLogCollapseKey] ?? previous[workLogCollapseKey];
  const toolCallId = next.toolCallId ?? previous.toolCallId;
  const toolLifecycleStatus = next.toolLifecycleStatus ?? previous.toolLifecycleStatus;
  const toolData = next.toolData ?? previous.toolData;
  return {
    ...previous,
    ...next,
    ...(detail ? { detail } : {}),
    ...(viewedImagePath ? { viewedImagePath } : {}),
    ...(command ? { command } : {}),
    ...(rawCommand ? { rawCommand } : {}),
    ...(changedFiles.length > 0 ? { changedFiles } : {}),
    ...(toolTitle ? { toolTitle } : {}),
    ...(toolSurface ? { toolSurface } : {}),
    ...(toolIcon ? { toolIcon } : {}),
    ...(toolSource ? { toolSource } : {}),
    ...(itemType ? { itemType } : {}),
    ...(requestKind ? { requestKind } : {}),
    ...(collapseKey ? { [workLogCollapseKey]: collapseKey } : {}),
    ...(toolCallId ? { toolCallId } : {}),
    ...(toolLifecycleStatus !== undefined ? { toolLifecycleStatus } : {}),
    ...(toolData !== undefined ? { toolData } : {}),
  };
}

function mergeChangedFiles(
  previous: ReadonlyArray<string> | undefined,
  next: ReadonlyArray<string> | undefined,
): string[] {
  const merged = [...(previous ?? []), ...(next ?? [])];
  if (merged.length === 0) {
    return [];
  }
  return [...new Set(merged)];
}

function deriveToolLifecycleCollapseKey(entry: DerivedWorkLogEntry): string | undefined {
  if (
    entry.taskId &&
    (entry.sourceActivityKind === "task.progress" || entry.sourceActivityKind === "task.completed")
  ) {
    return `task${entry.taskId}`;
  }
  if (
    entry.sourceActivityKind !== "tool.updated" &&
    entry.sourceActivityKind !== "tool.completed"
  ) {
    return undefined;
  }
  if (entry.toolCallId) {
    return `tool:${entry.turnId ?? "no-turn"}:${entry.toolCallId}`;
  }
  const normalizedLabel = normalizeCompactToolLabel(entry.toolTitle ?? entry.label);
  const detail = entry.detail?.trim() ?? "";
  const itemType = entry.itemType ?? "";
  if (normalizedLabel.length === 0 && detail.length === 0 && itemType.length === 0) {
    return undefined;
  }
  return [itemType, normalizedLabel, detail].join("\u001f");
}

function normalizeCompactToolLabel(value: string): string {
  return value.replace(/\s+(?:complete|completed)\s*$/i, "").trim();
}

function toLatestProposedPlanState(proposedPlan: ProposedPlan): LatestProposedPlanState {
  return {
    id: proposedPlan.id,
    createdAt: proposedPlan.createdAt,
    updatedAt: proposedPlan.updatedAt,
    turnId: proposedPlan.turnId,
    planMarkdown: proposedPlan.planMarkdown,
    implementedAt: proposedPlan.implementedAt,
    implementationThreadId: proposedPlan.implementationThreadId,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function trimMatchingOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    const unquoted = trimmed.slice(1, -1).trim();
    return unquoted.length > 0 ? unquoted : trimmed;
  }
  return trimmed;
}

function executableBasename(value: string): string | null {
  const trimmed = trimMatchingOuterQuotes(value);
  if (trimmed.length === 0) {
    return null;
  }
  const normalized = trimmed.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const last = segments.at(-1)?.trim() ?? "";
  return last.length > 0 ? last.toLowerCase() : null;
}

function splitExecutableAndRest(value: string): { executable: string; rest: string } | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const quote = trimmed.charAt(0);
    const closeIndex = trimmed.indexOf(quote, 1);
    if (closeIndex <= 0) {
      return null;
    }
    return {
      executable: trimmed.slice(0, closeIndex + 1),
      rest: trimmed.slice(closeIndex + 1).trim(),
    };
  }

  const firstWhitespace = trimmed.search(/\s/);
  if (firstWhitespace < 0) {
    return {
      executable: trimmed,
      rest: "",
    };
  }

  return {
    executable: trimmed.slice(0, firstWhitespace),
    rest: trimmed.slice(firstWhitespace).trim(),
  };
}

const SHELL_WRAPPER_SPECS = [
  {
    executables: ["pwsh", "pwsh.exe", "powershell", "powershell.exe"],
    wrapperFlagPattern: /(?:^|\s)-command\s+/i,
  },
  {
    executables: ["cmd", "cmd.exe"],
    wrapperFlagPattern: /(?:^|\s)\/c\s+/i,
  },
  {
    executables: ["bash", "sh", "zsh"],
    wrapperFlagPattern: /(?:^|\s)-(?:l)?c\s+/i,
  },
] as const;

function findShellWrapperSpec(shell: string) {
  return SHELL_WRAPPER_SPECS.find((spec) =>
    (spec.executables as ReadonlyArray<string>).includes(shell),
  );
}

function unwrapCommandRemainder(value: string, wrapperFlagPattern: RegExp): string | null {
  const match = wrapperFlagPattern.exec(value);
  if (!match) {
    return null;
  }

  const command = value.slice(match.index + match[0].length).trim();
  if (command.length === 0) {
    return null;
  }

  const openingQuote = command[0];
  if ((openingQuote === "'" || openingQuote === '"') && !command.endsWith(openingQuote)) {
    return null;
  }

  const unwrapped = trimMatchingOuterQuotes(command);
  return unwrapped.length > 0 ? unwrapped : null;
}

function unwrapKnownShellCommandWrapper(value: string): string {
  const split = splitExecutableAndRest(value);
  if (!split || split.rest.length === 0) {
    return value;
  }

  const shell = executableBasename(split.executable);
  if (!shell) {
    return value;
  }

  const spec = findShellWrapperSpec(shell);
  if (!spec) {
    return value;
  }

  return unwrapCommandRemainder(split.rest, spec.wrapperFlagPattern) ?? value;
}

function formatCommandArrayPart(value: string): string {
  return /[\s"'`]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function formatCommandValue(value: unknown): string | null {
  const direct = asTrimmedString(value);
  if (direct) {
    return direct;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const parts: Array<string> = [];
  for (const entry of value) {
    const part = asTrimmedString(entry);
    if (part !== null) {
      parts.push(part);
    }
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.map((part) => formatCommandArrayPart(part)).join(" ");
}

function normalizeCommandValue(value: unknown): string | null {
  const formatted = formatCommandValue(value);
  return formatted ? unwrapKnownShellCommandWrapper(formatted) : null;
}

function toRawToolCommand(value: unknown, normalizedCommand: string | null): string | null {
  const formatted = formatCommandValue(value);
  if (!formatted || normalizedCommand === null) {
    return null;
  }
  return formatted === normalizedCommand ? null : formatted;
}

function extractToolCommand(payload: Record<string, unknown> | null): {
  command: string | null;
  rawCommand: string | null;
} {
  const data = asRecord(payload?.data);
  const item = asRecord(data?.item);
  const itemResult = asRecord(item?.result);
  const itemInput = asRecord(item?.input);
  const itemType = asTrimmedString(payload?.itemType);
  const detail = asTrimmedString(payload?.detail);
  const candidates: unknown[] = [
    item?.command,
    itemInput?.command,
    itemResult?.command,
    data?.command,
    itemType === "command_execution" && detail ? stripTrailingExitCode(detail).output : null,
  ];

  for (const candidate of candidates) {
    const command = normalizeCommandValue(candidate);
    if (!command) {
      continue;
    }
    return {
      command,
      rawCommand: toRawToolCommand(candidate, command),
    };
  }

  return {
    command: null,
    rawCommand: null,
  };
}

function extractToolTitle(payload: Record<string, unknown> | null): string | null {
  return asTrimmedString(payload?.title);
}

function extractToolCallId(payload: Record<string, unknown> | null): string | null {
  const data = asRecord(payload?.data);
  return asTrimmedString(payload?.toolCallId) ?? asTrimmedString(data?.toolCallId);
}

function normalizeInlinePreview(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateInlinePreview(value: string, maxLength = 84): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizePreviewForComparison(value: string | null | undefined): string | null {
  const normalized = asTrimmedString(value);
  if (!normalized) {
    return null;
  }
  return normalizeCompactToolLabel(normalizeInlinePreview(normalized)).toLowerCase();
}

function summarizeToolTextOutput(value: string): string | null {
  const lines: Array<string> = [];
  for (const rawLine of value.split(/\r?\n/u)) {
    const line = normalizeInlinePreview(rawLine);
    if (line.length > 0) {
      lines.push(line);
    }
  }
  const firstLine = lines.find((line) => line !== "```");
  if (firstLine) {
    return truncateInlinePreview(firstLine);
  }
  if (lines.length > 1) {
    return `${lines.length.toLocaleString()} lines`;
  }
  return null;
}

function summarizeToolRawOutput(payload: Record<string, unknown> | null): string | null {
  const data = asRecord(payload?.data);
  const rawOutput = asRecord(data?.rawOutput);
  if (!rawOutput) {
    return null;
  }

  const totalFiles = asNumber(rawOutput.totalFiles);
  if (totalFiles !== null) {
    const suffix = rawOutput.truncated === true ? "+" : "";
    return `${totalFiles.toLocaleString()} file${totalFiles === 1 ? "" : "s"}${suffix}`;
  }

  const content = asTrimmedString(rawOutput.content);
  if (content) {
    return summarizeToolTextOutput(content);
  }

  const stdout = asTrimmedString(rawOutput.stdout);
  if (stdout) {
    return summarizeToolTextOutput(stdout);
  }

  return null;
}

function extractToolOutput(payload: Record<string, unknown> | null): string | null {
  const output = extractCommandOutputText(payload?.data);
  return output ? stripTrailingExitCode(output).output : null;
}

function isCommandToolDetail(payload: Record<string, unknown> | null, heading: string): boolean {
  const data = asRecord(payload?.data);
  const kind = asTrimmedString(data?.kind)?.toLowerCase();
  const title = asTrimmedString(payload?.title ?? heading)?.toLowerCase();
  return (
    extractWorkLogItemType(payload) === "command_execution" ||
    kind === "execute" ||
    title === "terminal" ||
    title === "ran command"
  );
}

function extractToolDetail(
  payload: Record<string, unknown> | null,
  heading: string,
): string | null {
  const rawDetail = asTrimmedString(payload?.detail);
  const detail = rawDetail ? stripTrailingExitCode(rawDetail).output : null;
  const normalizedHeading = normalizePreviewForComparison(heading);
  const normalizedDetail = normalizePreviewForComparison(detail);
  const commandTool = isCommandToolDetail(payload, heading);
  const commandPreview = commandTool
    ? extractToolCommand(payload)
    : { command: null, rawCommand: null };
  const command = commandPreview.command;

  if (commandTool && command) {
    const output = extractToolOutput(payload);
    if (output) return output;
  }

  const data = asRecord(payload?.data);
  const repeatsCommand =
    detail !== null &&
    commandDetailRepeatsCommand({
      detail,
      command,
      rawCommand: commandPreview.rawCommand,
      toolName: data?.toolName,
      data,
    });

  if (detail && normalizedHeading !== normalizedDetail && (!commandTool || !repeatsCommand)) {
    return detail;
  }

  if (commandTool) {
    return null;
  }

  const rawOutputSummary = summarizeToolRawOutput(payload);
  if (rawOutputSummary) {
    const normalizedRawOutputSummary = normalizePreviewForComparison(rawOutputSummary);
    if (normalizedRawOutputSummary !== normalizedHeading) {
      return rawOutputSummary;
    }
  }

  return null;
}

function stripTrailingExitCode(value: string): {
  output: string | null;
  exitCode?: number | undefined;
} {
  const trimmed = value.trim();
  const match = /^(?<output>[\s\S]*?)(?:\s*<exited with exit code (?<code>\d+)>)\s*$/i.exec(
    trimmed,
  );
  if (!match?.groups) {
    return {
      output: trimmed.length > 0 ? trimmed : null,
    };
  }
  const exitCode = Number.parseInt(match.groups.code ?? "", 10);
  const normalizedOutput = match.groups.output?.trim() ?? "";
  return {
    output: normalizedOutput.length > 0 ? normalizedOutput : null,
    ...(Number.isInteger(exitCode) ? { exitCode } : {}),
  };
}

function extractWorkLogItemType(
  payload: Record<string, unknown> | null,
): WorkLogEntry["itemType"] | undefined {
  if (typeof payload?.itemType === "string" && isToolLifecycleItemType(payload.itemType)) {
    return payload.itemType;
  }
  return undefined;
}

function extractWorkLogRequestKind(
  payload: Record<string, unknown> | null,
): WorkLogEntry["requestKind"] | undefined {
  if (
    payload?.requestKind === "command" ||
    payload?.requestKind === "file-read" ||
    payload?.requestKind === "file-change" ||
    payload?.requestKind === "permission"
  ) {
    return payload.requestKind;
  }
  return requestKindFromRequestType(payload?.requestType) ?? undefined;
}

function pushChangedFile(target: string[], seen: Set<string>, value: unknown) {
  const normalized = asTrimmedString(value);
  if (!normalized || seen.has(normalized)) {
    return;
  }
  seen.add(normalized);
  target.push(normalized);
}

function collectChangedFiles(value: unknown, target: string[], seen: Set<string>, depth: number) {
  if (depth > 4 || target.length >= 12) {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectChangedFiles(entry, target, seen, depth + 1);
      if (target.length >= 12) {
        return;
      }
    }
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  pushChangedFile(target, seen, record.path);
  pushChangedFile(target, seen, record.filePath);
  pushChangedFile(target, seen, record.relativePath);
  pushChangedFile(target, seen, record.filename);
  pushChangedFile(target, seen, record.newPath);
  pushChangedFile(target, seen, record.oldPath);

  for (const nestedKey of [
    "item",
    "result",
    "input",
    "data",
    "changes",
    "files",
    "edits",
    "patch",
    "patches",
    "operations",
  ]) {
    if (!(nestedKey in record)) {
      continue;
    }
    collectChangedFiles(record[nestedKey], target, seen, depth + 1);
    if (target.length >= 12) {
      return;
    }
  }
}

function extractChangedFiles(payload: Record<string, unknown> | null): string[] {
  const changedFiles: string[] = [];
  const seen = new Set<string>();
  collectChangedFiles(asRecord(payload?.data), changedFiles, seen, 0);
  return changedFiles;
}

function compareActivitiesByOrder(
  left: OrchestrationThreadActivity,
  right: OrchestrationThreadActivity,
): number {
  if (left.sequence !== undefined && right.sequence !== undefined) {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
  } else if (left.sequence !== undefined) {
    return 1;
  } else if (right.sequence !== undefined) {
    return -1;
  }

  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  const lifecycleRankComparison =
    compareActivityLifecycleRank(left.kind) - compareActivityLifecycleRank(right.kind);
  if (lifecycleRankComparison !== 0) {
    return lifecycleRankComparison;
  }

  return left.id.localeCompare(right.id);
}

function compareActivityLifecycleRank(kind: string): number {
  if (kind.endsWith(".started") || kind === "tool.started") {
    return 0;
  }
  if (kind.endsWith(".progress") || kind.endsWith(".updated")) {
    return 1;
  }
  if (kind.endsWith(".completed") || kind.endsWith(".resolved")) {
    return 2;
  }
  return 1;
}

function timelineEntryFromMessage(message: ChatMessage): TimelineEntry {
  return {
    id: message.id,
    kind: "message",
    createdAt: message.createdAt,
    message,
  };
}

function timelineEntryFromProposedPlan(proposedPlan: ProposedPlan): TimelineEntry {
  return {
    id: proposedPlan.id,
    kind: "proposed-plan",
    createdAt: proposedPlan.createdAt,
    proposedPlan,
  };
}

function timelineEntryFromWork(workEntry: WorkLogEntry): TimelineEntry {
  return {
    id: workEntry.id,
    kind: "work",
    createdAt: workEntry.createdAt,
    entry: workEntry,
  };
}

function compareTimelineEntriesByCreatedAt(left: TimelineEntry, right: TimelineEntry): number {
  return left.createdAt.localeCompare(right.createdAt);
}

function timelineEntrySourceOrder(entry: TimelineEntry): number {
  switch (entry.kind) {
    case "message":
      return 0;
    case "proposed-plan":
      return 1;
    case "work":
      return 2;
  }
}

function shouldTakePreviousTimelineEntry(previous: TimelineEntry, suffix: TimelineEntry): boolean {
  const createdAtComparison = compareTimelineEntriesByCreatedAt(previous, suffix);
  if (createdAtComparison !== 0) return createdAtComparison < 0;
  return timelineEntrySourceOrder(previous) <= timelineEntrySourceOrder(suffix);
}

function hasExactArrayPrefix<T>(previous: ReadonlyArray<T>, next: ReadonlyArray<T>): boolean {
  if (previous === next) return true;
  if (next.length < previous.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) return false;
  }
  return true;
}

function mergeTimelineEntrySuffix(
  previous: ReadonlyArray<TimelineEntry>,
  suffix: ReadonlyArray<TimelineEntry>,
): TimelineEntry[] {
  if (suffix.length === 0) return [...previous];
  const previousLast = previous.at(-1);
  let suffixIsOrdered = true;
  for (let index = 1; index < suffix.length; index += 1) {
    if (compareTimelineEntriesByCreatedAt(suffix[index - 1]!, suffix[index]!) > 0) {
      suffixIsOrdered = false;
      break;
    }
  }
  if (
    suffixIsOrdered &&
    (previousLast === undefined || shouldTakePreviousTimelineEntry(previousLast, suffix[0]!))
  ) {
    return [...previous, ...suffix];
  }

  const merged: TimelineEntry[] = [];
  let previousIndex = 0;
  let suffixIndex = 0;
  while (previousIndex < previous.length || suffixIndex < suffix.length) {
    const previousEntry = previous[previousIndex];
    const suffixEntry = suffix[suffixIndex];
    if (
      previousEntry !== undefined &&
      (suffixEntry === undefined || shouldTakePreviousTimelineEntry(previousEntry, suffixEntry))
    ) {
      merged.push(previousEntry);
      previousIndex += 1;
    } else if (suffixEntry !== undefined) {
      merged.push(suffixEntry);
      suffixIndex += 1;
    }
  }
  return merged;
}

type AttachmentResource = Extract<AssetResource, { readonly _tag: "attachment" }>;
const EMPTY_IMAGE_RESOURCES = Object.freeze<ReadonlyArray<AttachmentResource>>([]);

export function selectMessageImageResources(
  attachments: ChatMessage["attachments"],
): ReadonlyArray<AttachmentResource> {
  const attachmentIds = new Set<string>();
  for (const attachment of attachments ?? []) {
    if (!isImageAttachment(attachment)) continue;
    const previewUrl = attachment.previewUrl;
    if (previewUrl?.startsWith("blob:") || previewUrl?.startsWith("data:")) continue;
    attachmentIds.add(attachment.id);
  }
  return attachmentIds.size === 0
    ? EMPTY_IMAGE_RESOURCES
    : Array.from(attachmentIds, (attachmentId) => ({ _tag: "attachment", attachmentId }));
}

export function selectHandoffImageResources(
  messages: ReadonlyArray<ChatMessage> | undefined,
  handoffs: Readonly<Record<string, ReadonlyArray<string>>>,
): ReadonlyArray<AttachmentResource> {
  if (Object.keys(handoffs).length === 0) return EMPTY_IMAGE_RESOURCES;
  const attachmentIds = new Set<string>();
  for (const message of messages ?? []) {
    if (message.role !== "user" || !handoffs[message.id]?.length) continue;
    for (const attachment of message.attachments ?? []) {
      if (isImageAttachment(attachment)) attachmentIds.add(attachment.id);
    }
  }
  return attachmentIds.size === 0
    ? EMPTY_IMAGE_RESOURCES
    : Array.from(attachmentIds, (attachmentId) => ({ _tag: "attachment", attachmentId }));
}

export function createMessageAttachmentPreviewProjector() {
  const attachmentsBySource = new WeakMap<
    ReadonlyArray<ChatAttachment>,
    ReadonlyArray<ChatAttachment>
  >();
  const messagesBySource = new WeakMap<ChatMessage, ChatMessage>();
  return (
    message: ChatMessage,
    previewUrlFor: (attachment: ChatAttachment) => string | undefined,
  ): ChatMessage => {
    const source = message.attachments;
    if (!source || source.length === 0) return message;
    const previous = attachmentsBySource.get(source) ?? source;
    let changed: ChatAttachment[] | undefined;
    let hasOverrides = false;
    for (const [index, attachment] of source.entries()) {
      const previewUrl = previewUrlFor(attachment);
      const sourceUrl = "previewUrl" in attachment ? attachment.previewUrl : undefined;
      const previousAttachment = previous[index]!;
      const previousUrl =
        "previewUrl" in previousAttachment ? previousAttachment.previewUrl : undefined;
      const next =
        !previewUrl || previewUrl === sourceUrl
          ? attachment
          : previewUrl === previousUrl
            ? previousAttachment
            : { ...attachment, previewUrl };
      hasOverrides ||= next !== attachment;
      if (next !== previousAttachment) {
        changed ??= previous.slice();
        changed[index] = next;
      }
    }
    const attachments = hasOverrides ? (changed ?? previous) : source;
    attachmentsBySource.set(source, attachments);
    if (attachments === source) {
      messagesBySource.delete(message);
      return message;
    }
    const previousMessage = messagesBySource.get(message);
    if (previousMessage?.attachments === attachments) return previousMessage;
    const result = { ...message, attachments };
    messagesBySource.set(message, result);
    return result;
  };
}

const streamsText = (role: ChatMessage["role"]) => role === "assistant" || role === "reasoning";

export function isStreamingMessageTextUpdate(previous: ChatMessage, next: ChatMessage): boolean {
  if (
    !streamsText(previous.role) ||
    previous.role !== next.role ||
    !previous.streaming ||
    !next.streaming
  ) {
    return false;
  }
  const { text: _previousText, updatedAt: _previousUpdatedAt, ...previousMetadata } = previous;
  const { text: _nextText, updatedAt: _nextUpdatedAt, ...nextMetadata } = next;
  return shallow(previousMetadata, nextMetadata);
}

function replaceStreamingTimelineMessages(
  messages: ReadonlyArray<ChatMessage>,
  previous: TimelineEntriesProjection,
): TimelineEntry[] | null {
  if (messages.length !== previous.messages.length) return null;
  const replacements = new Map<ChatMessage, ChatMessage>();
  for (const [index, message] of messages.entries()) {
    const previousMessage = previous.messages[index]!;
    if (message === previousMessage) continue;
    if (!isStreamingMessageTextUpdate(previousMessage, message)) return null;
    replacements.set(previousMessage, message);
  }
  if (replacements.size === 0) return previous.entries;
  return previous.entries.map((entry) => {
    const replacement = entry.kind === "message" ? replacements.get(entry.message) : undefined;
    return replacement ? timelineEntryFromMessage(replacement) : entry;
  });
}

export function deriveTimelineEntriesWithState(
  messages: ReadonlyArray<ChatMessage>,
  proposedPlans: ReadonlyArray<ProposedPlan>,
  workEntries: ReadonlyArray<WorkLogEntry>,
  previous: TimelineEntriesProjection | null = null,
): TimelineEntriesProjection {
  if (
    previous !== null &&
    previous.proposedPlans.length === proposedPlans.length &&
    previous.workEntries.length === workEntries.length &&
    hasExactArrayPrefix(previous.proposedPlans, proposedPlans) &&
    hasExactArrayPrefix(previous.workEntries, workEntries)
  ) {
    const entries = replaceStreamingTimelineMessages(messages, previous);
    if (entries !== null) return { messages, proposedPlans, workEntries, entries };
  }
  const foldedAnswerMessageIds = new Set(
    workEntries.flatMap((entry) =>
      entry.questionAnswer ? [`async-answer:${entry.questionAnswer.requestId}`] : [],
    ),
  );
  const showMessage = (message: ChatMessage) =>
    message.role !== "user" || !foldedAnswerMessageIds.has(message.id);
  const canAppend =
    previous !== null &&
    !previous.entries.some((entry) => entry.kind === "message" && !showMessage(entry.message)) &&
    hasExactArrayPrefix(previous.messages, messages) &&
    hasExactArrayPrefix(previous.proposedPlans, proposedPlans) &&
    hasExactArrayPrefix(previous.workEntries, workEntries);

  if (canAppend) {
    const messageRows = messages
      .slice(previous.messages.length)
      .filter(showMessage)
      .map(timelineEntryFromMessage);
    const proposedPlanRows = proposedPlans
      .slice(previous.proposedPlans.length)
      .map(timelineEntryFromProposedPlan);
    const workRows = workEntries.slice(previous.workEntries.length).map(timelineEntryFromWork);
    const suffix = [...messageRows, ...proposedPlanRows, ...workRows].toSorted(
      compareTimelineEntriesByCreatedAt,
    );
    return {
      messages,
      proposedPlans,
      workEntries,
      entries: mergeTimelineEntrySuffix(previous.entries, suffix),
    };
  }

  const messageRows = messages.filter(showMessage).map(timelineEntryFromMessage);
  const proposedPlanRows = proposedPlans.map(timelineEntryFromProposedPlan);
  const workRows = workEntries.map(timelineEntryFromWork);
  return {
    messages,
    proposedPlans,
    workEntries,
    entries: [...messageRows, ...proposedPlanRows, ...workRows].toSorted(
      compareTimelineEntriesByCreatedAt,
    ),
  };
}

export function deriveTimelineEntries(
  messages: ReadonlyArray<ChatMessage>,
  proposedPlans: ReadonlyArray<ProposedPlan>,
  workEntries: ReadonlyArray<WorkLogEntry>,
): TimelineEntry[] {
  return deriveTimelineEntriesWithState(messages, proposedPlans, workEntries).entries;
}

export function inferCheckpointTurnCountByTurnId(
  summaries: ReadonlyArray<TurnDiffSummary>,
): Record<TurnId, number> {
  const sorted = [...summaries].toSorted((a, b) => a.completedAt.localeCompare(b.completedAt));
  const result: Record<TurnId, number> = {};
  for (let index = 0; index < sorted.length; index += 1) {
    const summary = sorted[index];
    if (!summary) continue;
    result[summary.turnId] = index + 1;
  }
  return result;
}

export function derivePhase(session: ThreadSession | null): SessionPhase {
  if (
    !session ||
    session.status === "stopped" ||
    session.status === "interrupted" ||
    session.status === "error"
  ) {
    return "disconnected";
  }
  if (session.status === "starting") return "connecting";
  if (session.status === "running") return "running";
  return "ready";
}

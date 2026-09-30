import type {
  ModelSelection,
  PreviewAnnotationPayload,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
import { create } from "zustand";

import type { LocalDispatchSnapshot } from "./components/ChatView.logic";
import type { ComposerFileAttachment, ComposerImageAttachment } from "./composerDraftStore";
import type { TerminalContextDraft } from "./lib/terminalContext";
import { randomUUID } from "./lib/utils";
import type { ReviewCommentContext } from "./reviewCommentContext";

export interface QueuedMessageSendSettings {
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  promptEffort: string | null;
}

export interface QueuedComposerMessage {
  id: string;
  prompt: string;
  images: ComposerImageAttachment[];
  files: ComposerFileAttachment[];
  terminalContexts: TerminalContextDraft[];
  previewAnnotations: PreviewAnnotationPayload[];
  reviewComments: ReviewCommentContext[];
  sendSettings: QueuedMessageSendSettings;
  queuedAfterToolActivityId: string | null;
  holdUntilUserAction?: boolean;
  sending?: "preparing" | "dispatching";
  createdAt: string;
}

interface QueuedDispatch {
  messageId: string | null;
  thread: LocalDispatchSnapshot;
  previous: LocalDispatchSnapshot | null;
}

interface QueuedMessageStoreState {
  queuesByThreadKey: Record<string, QueuedComposerMessage[]>;
  lastDispatchByThreadKey: Record<string, QueuedDispatch>;
  enqueue: (threadKey: string, message: Omit<QueuedComposerMessage, "id">) => QueuedComposerMessage;
  beginSend: (
    threadKey: string,
    id: string,
    toolActivityId: string | null,
  ) => QueuedComposerMessage | null;
  markDispatching: (threadKey: string, id: string, thread: LocalDispatchSnapshot) => boolean;
  finishSend: (threadKey: string, id: string) => void;
  failSend: (threadKey: string, id: string) => boolean;
  remove: (threadKey: string, id: string) => QueuedComposerMessage | null;
  drain: (threadKey: string) => QueuedComposerMessage[];
}

const EMPTY_QUEUE: QueuedComposerMessage[] = [];

type QueueState = Pick<QueuedMessageStoreState, "queuesByThreadKey" | "lastDispatchByThreadKey">;

function withQueue(
  state: QueueState,
  threadKey: string,
  queue: QueuedComposerMessage[],
  lastDispatch?: QueuedDispatch | null,
): QueueState {
  const queuesByThreadKey = { ...state.queuesByThreadKey, [threadKey]: queue };
  const lastDispatchByThreadKey = { ...state.lastDispatchByThreadKey };
  if (lastDispatch) lastDispatchByThreadKey[threadKey] = lastDispatch;
  if (queue.length === 0) delete queuesByThreadKey[threadKey];
  if (queue.length === 0 || lastDispatch === null) delete lastDispatchByThreadKey[threadKey];
  return { queuesByThreadKey, lastDispatchByThreadKey };
}

export const useQueuedMessageStore = create<QueuedMessageStoreState>()((set, get) => {
  const queueOf = (threadKey: string) => get().queuesByThreadKey[threadKey] ?? EMPTY_QUEUE;
  const update = (
    threadKey: string,
    queue: QueuedComposerMessage[],
    lastDispatch?: QueuedDispatch | null,
  ) => set((state) => withQueue(state, threadKey, queue, lastDispatch));
  return {
    queuesByThreadKey: {},
    lastDispatchByThreadKey: {},
    enqueue: (threadKey, message) => {
      const entry: QueuedComposerMessage = { ...message, id: randomUUID() };
      update(threadKey, [...queueOf(threadKey), entry]);
      return entry;
    },
    beginSend: (threadKey, id, toolActivityId) => {
      const queue = queueOf(threadKey);
      const entry = queue.find((message) => message.id === id);
      if (!entry || queue.some((message) => message.sending)) return null;
      update(
        threadKey,
        queue.map((message) =>
          message.id === id
            ? { ...message, sending: "preparing" }
            : message.queuedAfterToolActivityId === toolActivityId
              ? message
              : { ...message, queuedAfterToolActivityId: toolActivityId },
        ),
      );
      return entry;
    },
    markDispatching: (threadKey, id, thread) => {
      const queue = queueOf(threadKey);
      if (!queue.some((message) => message.id === id && message.sending)) return false;
      update(
        threadKey,
        queue.map((message) =>
          message.id === id ? { ...message, sending: "dispatching" } : message,
        ),
        {
          messageId: id,
          thread,
          previous: get().lastDispatchByThreadKey[threadKey]?.thread ?? null,
        },
      );
      return true;
    },
    finishSend: (threadKey, id) => {
      const queue = queueOf(threadKey);
      if (!queue.some((message) => message.id === id)) return;
      update(
        threadKey,
        queue.filter((message) => message.id !== id),
      );
    },
    failSend: (threadKey, id) => {
      const queue = queueOf(threadKey);
      const entry = queue.find((message) => message.id === id);
      if (!entry) return false;
      const { sending: _sending, ...rest } = entry;
      const dispatch = get().lastDispatchByThreadKey[threadKey];
      update(
        threadKey,
        [{ ...rest, holdUntilUserAction: true }, ...queue.filter((message) => message.id !== id)],
        dispatch?.messageId !== id
          ? undefined
          : dispatch.previous && { messageId: null, thread: dispatch.previous, previous: null },
      );
      return true;
    },
    remove: (threadKey, id) => {
      const queue = queueOf(threadKey);
      const entry = queue.find((message) => message.id === id);
      if (!entry || entry.sending) return null;
      update(
        threadKey,
        queue.filter((message) => message.id !== id),
      );
      return entry;
    },
    drain: (threadKey) => {
      const queue = queueOf(threadKey);
      const drained = queue.filter((message) => message.sending !== "dispatching");
      if (drained.length === 0) return EMPTY_QUEUE;
      update(
        threadKey,
        queue.filter((message) => message.sending === "dispatching"),
      );
      return drained;
    },
  };
});

export function latestCompletedToolActivityId(
  activities: ReadonlyArray<{
    readonly id: string;
    readonly kind: string;
    readonly sequence?: number | undefined;
    readonly createdAt: string;
  }>,
): string | null {
  let latest: (typeof activities)[number] | null = null;
  for (const activity of activities) {
    if (activity.kind !== "tool.completed") continue;
    if (
      latest === null ||
      (activity.sequence ?? -1) > (latest.sequence ?? -1) ||
      ((activity.sequence ?? -1) === (latest.sequence ?? -1) &&
        activity.createdAt > latest.createdAt)
    ) {
      latest = activity;
    }
  }
  return latest?.id ?? null;
}

export function isQueuedMessageDue(input: {
  message: Pick<QueuedComposerMessage, "queuedAfterToolActivityId" | "holdUntilUserAction">;
  phase: "connecting" | "running" | "ready" | "disconnected";
  latestToolActivityId: string | null;
}): boolean {
  if (input.message.holdUntilUserAction) return false;
  if (input.phase === "connecting") return false;
  if (input.phase !== "running") return true;
  return input.latestToolActivityId !== input.message.queuedAfterToolActivityId;
}

export function useQueuedMessages(threadKey: string): QueuedComposerMessage[] {
  return useQueuedMessageStore((state) => state.queuesByThreadKey[threadKey] ?? EMPTY_QUEUE);
}

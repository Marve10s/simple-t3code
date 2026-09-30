import type { EnvironmentId } from "@t3tools/contracts";

import { appAtomRegistry } from "./atom-registry";
import { threadOutboxManager } from "./thread-outbox";
import type { QueuedThreadMessage } from "./thread-outbox-model";
import {
  clearComposerDraft,
  composerDraftsAtom,
  flushComposerDrafts,
  scheduleUnusedComposerAttachmentCleanup,
  waitForComposerDraftsLoaded,
} from "./use-composer-drafts";

async function cleanUpRemovedMessages(
  removedMessages: ReadonlyArray<QueuedThreadMessage>,
): Promise<void> {
  const attachments = removedMessages.flatMap((message) => message.attachments);
  const removedCreations = removedMessages.filter((message) => message.creation !== undefined);
  if (removedCreations.length === 0) {
    scheduleUnusedComposerAttachmentCleanup(attachments);
    return;
  }

  try {
    await waitForComposerDraftsLoaded();
    const liveMessageIds = new Set(
      Object.values(appAtomRegistry.get(threadOutboxManager.queuedMessagesByThreadKeyAtom))
        .flat()
        .map((message) => message.messageId),
    );
    const drafts = appAtomRegistry.get(composerDraftsAtom);
    let clearedDraft = false;
    for (const message of removedCreations) {
      if (liveMessageIds.has(message.messageId)) {
        continue;
      }
      const draftKey = `pending-task:${message.messageId}`;
      const draft = drafts[draftKey];
      if (draft === undefined) {
        continue;
      }
      attachments.push(...draft.attachments);
      clearComposerDraft(draftKey, { deferAttachmentCleanup: true });
      clearedDraft = true;
    }
    if (clearedDraft) {
      await flushComposerDrafts();
    }
  } catch (error) {
    console.warn("[thread-outbox] failed to clean up removed pending task drafts", error);
    return;
  }

  scheduleUnusedComposerAttachmentCleanup(attachments);
}

export async function removeThreadOutboxMessage(
  message: QueuedThreadMessage,
  expectedRevision?: number,
  canRemove?: () => boolean,
): Promise<boolean> {
  const removed = await threadOutboxManager.remove(message, expectedRevision, canRemove);
  if (removed === null) {
    return false;
  }
  await cleanUpRemovedMessages([removed]);
  return true;
}

export async function clearThreadOutboxEnvironment(environmentId: EnvironmentId): Promise<void> {
  const removed = await threadOutboxManager.clearEnvironment(environmentId);
  await cleanUpRemovedMessages(removed);
}

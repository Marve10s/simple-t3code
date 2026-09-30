import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  runAtomCommand,
  squashAtomCommandFailure,
  type AtomCommand,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { serializeLegacyContextMessage } from "@t3tools/shared/composerContextLegacySend";
import { applyClaudePromptEffortPrefix } from "@t3tools/shared/model";

import { buildMessageContext, terminalContextReference } from "../../lib/composerContextRecords";
import { removeInlineContextReference } from "../../lib/composerContextReferences";
import {
  awaitAttachmentUploads,
  getUploadedAttachments,
  releaseDraftAttachments,
  startAttachmentUpload,
} from "../../lib/attachmentUploadQueue";
import { newMessageId } from "../../lib/utils";
import { latestCompletedToolActivityId, useQueuedMessageStore } from "../../queuedMessageStore";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { readThread, readThreadShell } from "../../state/entities";
import { environmentServerConfigsAtom } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import {
  createLocalDispatchSnapshot,
  deriveComposerSendState,
  readFileAsDataUrl,
  resolveThreadMetadataUpdateForNextTurn,
  revokeBlobPreviewUrl,
} from "../ChatView.logic";
import { toastManager } from "../ui/toast";
import { fileAttachmentCapabilityBlockReason } from "./composerAttachmentFiles";
import { ATTACHMENT_ONLY_BOOTSTRAP_PROMPT } from "./composerPromptHistory";

async function run<W, A, E>(command: AtomCommand<W, A, E>, input: W): Promise<A> {
  const result = await runAtomCommand(appAtomRegistry, command, input, { reportFailure: false });
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return result.value;
}

export async function sendQueuedMessage(
  threadRef: ScopedThreadRef,
  messageId: string,
): Promise<void> {
  const { environmentId, threadId } = threadRef;
  const threadKey = scopedThreadKey(threadRef);
  const queue = useQueuedMessageStore.getState();
  const message = queue.beginSend(
    threadKey,
    messageId,
    latestCompletedToolActivityId(readThread(threadRef)?.activities ?? []),
  );
  if (!message) return;
  const { sendSettings } = message;
  const attachments = [...message.images, ...message.files];
  const readConfig = () => appAtomRegistry.get(environmentServerConfigsAtom).get(environmentId);
  const assertFilesAllowed = () => {
    const config = readConfig();
    const reason = fileAttachmentCapabilityBlockReason({
      files: message.files,
      attachmentUploadsCapabilityKnown: config !== undefined,
      supportsAttachmentUploads: config?.environment.capabilities.attachmentUploads === true,
      maxFileAttachmentBytes:
        config?.environment.capabilities.fileAttachments?.maxUploadBytes ?? null,
    });
    if (reason !== null) throw new Error(reason);
  };
  try {
    const { sendableTerminalContexts, hasSendableContent } = deriveComposerSendState({
      prompt: message.prompt,
      imageCount: attachments.length,
      terminalContexts: message.terminalContexts,
      elementContextCount: message.previewAnnotations.length + message.reviewComments.length,
    });
    if (!hasSendableContent) {
      queue.finishSend(threadKey, message.id);
      return;
    }
    const prompt = message.terminalContexts
      .filter((context) => !sendableTerminalContexts.includes(context))
      .reduce(
        (text, context) =>
          removeInlineContextReference(text, terminalContextReference(context).contextId).prompt,
        message.prompt,
      )
      .trim();
    const text = applyClaudePromptEffortPrefix(
      prompt || ATTACHMENT_ONLY_BOOTSTRAP_PROMPT,
      sendSettings.promptEffort,
    );

    assertFilesAllowed();
    const useUploads = readConfig()?.environment.capabilities.attachmentUploads === true;
    if (useUploads && attachments.length > 0) {
      for (const attachment of attachments) {
        startAttachmentUpload({ environmentId, image: attachment, draftTarget: threadRef });
      }
      await awaitAttachmentUploads(attachments.map((attachment) => attachment.id));
    }
    const wireAttachments = await Promise.all(
      attachments.map(async (attachment) => {
        if (useUploads) {
          const uploaded = getUploadedAttachments({ environmentId, images: [attachment] })?.[0];
          if (!uploaded) throw new Error(`Attachment '${attachment.name}' did not upload.`);
          return uploaded;
        }
        if (attachment.type !== "image") {
          throw new Error("This server does not support file attachments.");
        }
        return {
          type: "image" as const,
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          dataUrl: await readFileAsDataUrl(attachment.file),
          ...(attachment.source ? { source: attachment.source } : {}),
        };
      }),
    );
    assertFilesAllowed();

    const createdAt = new Date().toISOString();
    const shell = readThreadShell(threadRef);
    const metadataUpdate = shell
      ? resolveThreadMetadataUpdateForNextTurn({
          currentModelSelection: shell.modelSelection,
          nextModelSelection: sendSettings.modelSelection,
          currentBranch: shell.branch,
        })
      : null;
    if (metadataUpdate) {
      await run(threadEnvironment.updateMetadata, {
        environmentId,
        input: { threadId, ...metadataUpdate },
      });
    }
    if (shell && shell.runtimeMode !== sendSettings.runtimeMode) {
      await run(threadEnvironment.setRuntimeMode, {
        environmentId,
        input: { threadId, runtimeMode: sendSettings.runtimeMode, createdAt },
      });
    }
    if (shell && shell.interactionMode !== sendSettings.interactionMode) {
      await run(threadEnvironment.setInteractionMode, {
        environmentId,
        input: { threadId, interactionMode: sendSettings.interactionMode, createdAt },
      });
    }

    const thread = readThread(threadRef) ?? undefined;
    if (!queue.markDispatching(threadKey, message.id, createLocalDispatchSnapshot(thread))) return;
    const context = buildMessageContext({
      terminalContexts: sendableTerminalContexts,
      reviewComments: message.reviewComments,
      previewAnnotations: message.previewAnnotations,
      attachments: attachments.map((attachment, index) => ({
        attachment,
        attachmentId: wireAttachments[index]?.id ?? attachment.id,
      })),
    });
    const inlineContext = readConfig()?.environment.capabilities.inlineMessageContext === true;
    await run(threadEnvironment.startTurn, {
      environmentId,
      input: {
        threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text:
            context !== undefined && !inlineContext
              ? serializeLegacyContextMessage({ text, records: context.records })
              : text,
          attachments: wireAttachments,
          ...(context !== undefined && inlineContext ? { context } : {}),
        },
        modelSelection: sendSettings.modelSelection,
        runtimeMode: sendSettings.runtimeMode,
        interactionMode: sendSettings.interactionMode,
        createdAt,
      },
    });
    queue.finishSend(threadKey, message.id);
    if (useUploads) releaseDraftAttachments(attachments);
    for (const image of message.images) revokeBlobPreviewUrl(image.previewUrl);
  } catch (error) {
    if (!queue.failSend(threadKey, message.id)) return;
    const title = readThreadShell(threadRef)?.title;
    toastManager.add({
      type: "error",
      title: title ? `Queued message not sent in "${title}"` : "Queued message not sent",
      description: error instanceof Error ? error.message : "Use Send now to try again.",
    });
  }
}

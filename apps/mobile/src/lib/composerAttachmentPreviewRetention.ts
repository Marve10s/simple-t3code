import type { FileBackedComposerAttachment } from "./composerImages";
import { retainComposerAttachmentFile } from "./composerAttachmentFiles";

type UnusedAttachmentHandler = (attachment: FileBackedComposerAttachment) => void;

let onAttachmentUnused: UnusedAttachmentHandler | null = null;

export function registerComposerAttachmentUnusedHandler(handler: UnusedAttachmentHandler): void {
  onAttachmentUnused = handler;
}

export function retainComposerAttachmentFileForPreview(
  attachment: FileBackedComposerAttachment,
): () => void {
  return retainComposerAttachmentFile(attachment.fileUri, () => {
    onAttachmentUnused?.(attachment);
  });
}

import { useNavigation } from "@react-navigation/native";
import { useCallback } from "react";
import { Alert } from "react-native";

import { removeThreadOutboxMessage } from "../../state/thread-outbox-removal";
import { clearComposerDraftContent } from "../../state/use-composer-drafts";
import type { PendingNewTask } from "../../state/use-pending-new-tasks";
import { releaseEditingQueuedMessage } from "../../state/use-thread-outbox";

export function usePendingTaskListActions(): {
  readonly openPendingTask: (pendingTask: PendingNewTask) => void;
  readonly confirmDeletePendingTask: (pendingTask: PendingNewTask) => void;
} {
  const navigation = useNavigation();

  const openPendingTask = useCallback(
    (pendingTask: PendingNewTask) => {
      navigation.navigate("NewTaskSheet", {
        screen: "NewTaskDraft",
        params: {
          environmentId: String(pendingTask.environmentId),
          projectId: String(pendingTask.projectId),
          ...(pendingTask.kind === "pending"
            ? { pendingTaskId: String(pendingTask.message.messageId) }
            : { draftId: pendingTask.draftKey }),
        },
      });
    },
    [navigation],
  );

  const confirmDeletePendingTask = useCallback((pendingTask: PendingNewTask) => {
    if (pendingTask.kind === "draft") {
      Alert.alert("Discard draft?", `“${pendingTask.title}” will be removed.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            clearComposerDraftContent(pendingTask.draftKey, {
              clearModelSelection: true,
              clearWorkspaceSelection: true,
            });
          },
        },
      ]);
      return;
    }
    Alert.alert(
      "Delete pending task?",
      `“${pendingTask.title}” has not been sent yet and will be removed from the outbox.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void removeThreadOutboxMessage(pendingTask.message)
              .then(() => releaseEditingQueuedMessage(pendingTask.message.messageId))
              .catch((error) => {
                Alert.alert(
                  "Could not delete pending task",
                  error instanceof Error ? error.message : "The pending task could not be removed.",
                );
              });
          },
        },
      ],
    );
  }, []);

  return { openPendingTask, confirmDeletePendingTask };
}

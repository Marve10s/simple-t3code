import type { WorktreeSetupCardProps } from "./worktree-setup-card";
import type { ComposerTextPaste } from "../../native/T3ComposerEditor.types";
import { type EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import {
  appendCodexArtifactTemplateUsePrompt,
  type CodexArtifactTemplate,
} from "@t3tools/client-runtime/codex-artifact-templates";
import type {
  CodexFeedbackSubmission,
  EnvironmentThreadStatus,
} from "@t3tools/client-runtime/state/threads";
import { useKeyboardChatComposerInset, useKeyboardScrollToEnd } from "@legendapp/list/keyboard";
import { resolveProviderSkillsForCwd } from "@t3tools/client-runtime/providerSkills";
import type { LegendListRef } from "@legendapp/list/react-native";
import { HeaderHeightContext } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import type {
  ApprovalRequestId,
  EnvironmentId,
  MessageId,
  ModelSelection,
  OrchestrationThreadShell,
  ProviderApprovalDecision,
  ProviderInteractionMode,
  RuntimeMode,
  ServerConfig as T3ServerConfig,
  ThreadId,
  UsageLimitsReport,
  UserInputQuestion,
} from "@t3tools/contracts";
import * as Haptics from "expo-haptics";
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  AppState,
  Keyboard,
  Platform,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from "react-native";
import {
  KeyboardController,
  KeyboardStickyView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWorkspaceContentWidth } from "../layout/workspace-content-width";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { collectProviderUsageLimits } from "@t3tools/shared/usageLimits";
import type { ComposerEditorHandle } from "../../components/ComposerEditor";
import type { StatusTone } from "../../components/StatusPill";
import type { DraftComposerAttachment } from "../../lib/composerImages";
import { RenderErrorBoundary, RenderFailureView } from "../../components/RenderErrorBoundary";
import { CHAT_CONTENT_MAX_WIDTH, type LayoutVariant } from "../../lib/layout";
import { IOS_NAV_BAR_HEIGHT } from "../../lib/layoutMetrics";
import { editPendingThreadMessage } from "../../state/edit-pending-thread-message";
import { deviceEnvironment } from "../../state/device";
import { useEnvironmentQuery } from "../../state/query";
import { threadDevicePreviews } from "../devices/threadDevicePreviews";
import type { QueuedThreadMessage } from "../../state/thread-outbox-model";
import { scopedThreadKey } from "../../lib/scopedEntities";
import { useDelayedStatus } from "../../lib/useDelayedStatus";
import type {
  PendingApproval,
  PendingUserInput,
  PendingUserInputDraftAnswer,
  ThreadFeedEntry,
} from "../../lib/threadActivity";
import { PendingApprovalCard } from "./PendingApprovalCard";
import { ComposerFeedback } from "./ComposerFeedback";
import { ComposerUsageLimits } from "./ComposerUsageLimits";
import { PendingUserInputCard } from "./PendingUserInputCard";
import { ThreadCreationFailedCard } from "./ThreadCreationFailedCard";
import {
  FLOATING_WORKING_CONTROL_COVERAGE,
  FloatingWorkingControl,
} from "./floating-working-control";
import { connectionFloatingStatus, type FloatingWorkingStatus } from "./floating-working-status";
import {
  derivePendingUserInputMaxHeight,
  ESTIMATED_KEYBOARD_HEIGHT,
  USER_INPUT_TOGGLE_DURATION_MS,
} from "./pendingUserInputLayout";
import {
  COMPOSER_COLLAPSED_CHROME,
  COMPOSER_EXPANDED_CHROME,
  COMPOSER_LAYOUT_TRANSITION,
  COMPOSER_TRANSITION_DURATION_MS,
  ThreadComposer,
} from "./ThreadComposer";
import { ThreadFeed } from "./ThreadFeed";
import type { ThreadContentPresentation } from "./threadContentPresentation";
import { resolveThreadFeedSubmissionAnchor } from "./thread-feed-live-follow";

export interface ThreadDetailScreenProps {
  readonly worktreeSetup?: WorktreeSetupCardProps | null;
  readonly setupWorkingStartedAt?: string | null;
  readonly selectedThread: OrchestrationThreadShell;
  readonly contentPresentation: ThreadContentPresentation;
  readonly screenTone: StatusTone;
  readonly connectionError: string | null;
  readonly environmentLabel: string | null;
  readonly feedbackSubmissions: ReadonlyArray<CodexFeedbackSubmission>;
  readonly onDismissFeedback: (id: MessageId) => void;
  readonly selectedThreadFeed: ReadonlyArray<ThreadFeedEntry>;
  readonly activeWorkStartedAt: string | null;
  readonly isCompacting: boolean;
  readonly creationState:
    | { readonly kind: "preparing"; readonly preparingWorktree: boolean }
    | { readonly kind: "failed"; readonly reason: string; readonly onEditTask: () => void }
    | null;
  readonly activePendingApproval: PendingApproval | null;
  readonly respondingApprovalId: ApprovalRequestId | null;
  readonly activePendingUserInput: PendingUserInput | null;
  readonly activePendingUserInputDrafts: Record<string, PendingUserInputDraftAnswer>;
  readonly activePendingUserInputAnswers: Record<string, string | ReadonlyArray<string>> | null;
  readonly respondingUserInputId: ApprovalRequestId | null;
  readonly draftMessage: string;
  readonly draftAttachments: ReadonlyArray<DraftComposerAttachment>;
  readonly connectionStateLabel: EnvironmentConnectionPhase;
  readonly threadSyncStatus?: EnvironmentThreadStatus;
  readonly loadEarlier?: { readonly loading: boolean; readonly onLoadEarlier: () => void } | null;
  readonly environmentId: EnvironmentId;
  readonly projectWorkspaceRoot: string | null;
  readonly threadCwd: string | null;
  readonly selectedThreadQueueCount: number;
  readonly queuedMessages: ReadonlyArray<QueuedThreadMessage>;
  readonly dispatchingMessageId: MessageId | null;
  readonly serverConfig: T3ServerConfig | null;
  readonly layoutVariant?: LayoutVariant;
  readonly usesAutomaticContentInsets?: boolean;
  readonly onHeaderMaterialVisibilityChange?: (visible: boolean) => void;
  readonly onOpenConnectionEditor: () => void;
  readonly onChangeDraftMessage: (value: string) => void;
  readonly onPickDraftMedia: () => Promise<void>;
  readonly onPickDraftFiles: () => Promise<void>;
  readonly onNativePasteImages: (uris: ReadonlyArray<string>) => Promise<void>;
  readonly onNativePasteText: (paste: ComposerTextPaste) => Promise<void>;
  readonly onRemoveDraftImage: (imageId: string) => void;
  readonly onStopThread: () => void;
  readonly onSendMessage: () => Promise<MessageId | null>;
  readonly onReconnectEnvironment: () => void;
  readonly onUpdateThreadModelSelection: (modelSelection: ModelSelection) => void;
  readonly onUpdateThreadRuntimeMode: (runtimeMode: RuntimeMode) => void;
  readonly onUpdateThreadInteractionMode: (interactionMode: ProviderInteractionMode) => void;
  readonly onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
  readonly onSelectUserInputOption: (
    requestId: ApprovalRequestId,
    question: UserInputQuestion,
    value: string,
  ) => void;
  readonly onChangeUserInputCustomAnswer: (
    requestId: ApprovalRequestId,
    questionId: string,
    customAnswer: string,
  ) => void;
  readonly onSubmitUserInput: () => Promise<unknown>;
  readonly onDismissUserInput: () => Promise<unknown>;
  readonly showContent?: boolean;
}

function latestStreamingAssistantMessage(
  feed: ReadonlyArray<ThreadFeedEntry>,
): { readonly id: string; readonly textLength: number } | null {
  for (let index = feed.length - 1; index >= 0; index -= 1) {
    const entry = feed[index];
    if (entry?.type !== "message") {
      continue;
    }
    if (entry.message.role !== "assistant" || !entry.message.streaming) {
      continue;
    }
    return {
      id: entry.message.id,
      textLength: entry.message.text.length,
    };
  }

  return null;
}

function useStreamingHaptics(threadId: ThreadId, feed: ReadonlyArray<ThreadFeedEntry>) {
  const lastStreamingAssistantRef = useRef<{
    readonly id: string;
    readonly textLength: number;
  } | null>(null);
  const lastStreamHapticAtRef = useRef(0);
  const hydratedRef = useRef(false);
  const previousThreadIdRef = useRef(threadId);

  useEffect(() => {
    if (previousThreadIdRef.current !== threadId) {
      previousThreadIdRef.current = threadId;
      hydratedRef.current = false;
    }

    const latestStreamingMessage = latestStreamingAssistantMessage(feed);

    if (!hydratedRef.current) {
      hydratedRef.current = true;
      lastStreamingAssistantRef.current = latestStreamingMessage;
      return;
    }

    if (!latestStreamingMessage) {
      lastStreamingAssistantRef.current = null;
      return;
    }

    const previousStreamingMessage = lastStreamingAssistantRef.current;
    lastStreamingAssistantRef.current = latestStreamingMessage;

    const isNewStream = previousStreamingMessage?.id !== latestStreamingMessage.id;
    const textGrew =
      previousStreamingMessage?.id === latestStreamingMessage.id &&
      latestStreamingMessage.textLength > previousStreamingMessage.textLength;

    if (!isNewStream && !textGrew) {
      return;
    }

    const now = Date.now();
    if (!isNewStream && now - lastStreamHapticAtRef.current < 320) {
      return;
    }

    lastStreamHapticAtRef.current = now;
    void Haptics.selectionAsync();
  }, [threadId, feed]);
}

const USER_INPUT_TOGGLE_TIMING = {
  duration: USER_INPUT_TOGGLE_DURATION_MS,
  easing: Easing.out(Easing.cubic),
};

export const ThreadDetailScreen = memo(function ThreadDetailScreen(props: ThreadDetailScreenProps) {
  const navigation = useNavigation();
  const deviceState = useEnvironmentQuery(
    deviceEnvironment.state({ environmentId: props.environmentId, input: {} }),
  );
  const devicePreviews = useMemo(
    () => threadDevicePreviews(deviceState.data, props.selectedThread.id),
    [deviceState.data, props.selectedThread.id],
  );
  const openDevicePreview = useCallback(() => {
    Keyboard.dismiss();
    navigation.navigate("ThreadDevicePreview", {
      environmentId: props.environmentId,
      threadId: props.selectedThread.id,
    });
  }, [navigation, props.environmentId, props.selectedThread.id]);
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardState((state) => state.isVisible);
  const liveKeyboardHeight = useKeyboardState((state) => state.height);
  const [keyboardStateSuspect, setKeyboardStateSuspect] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setKeyboardStateSuspect(true);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    setKeyboardStateSuspect(false);
  }, [isKeyboardVisible, liveKeyboardHeight]);
  const handleOwnedInputFocusChange = useCallback((focused: boolean) => {
    if (focused) {
      setKeyboardStateSuspect(false);
    }
  }, []);
  const windowHeight = useWindowDimensions().height;
  const navigationHeaderHeight = useContext(HeaderHeightContext) || insets.top + IOS_NAV_BAR_HEIGHT;
  const agentLabel = `${props.selectedThread.modelSelection.instanceId} agent`;
  const selectedThreadKey = scopedThreadKey(props.environmentId, props.selectedThread.id);
  const composerEditorRef = useRef<ComposerEditorHandle>(null);
  const draftMessageRef = useRef(props.draftMessage);
  draftMessageRef.current = props.draftMessage;
  const composerOverlayRef = useRef<View>(null);
  const listRef = useRef<LegendListRef>(null);
  const feedTouchStartRef = useRef<{ pageX: number; pageY: number } | null>(null);
  const selectedThreadKeyRef = useRef(selectedThreadKey);
  const lastScrolledSubmittedMessageIdRef = useRef<MessageId | null>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const handleComposerFocusChange = useCallback(
    (focused: boolean) => {
      setComposerFocused(focused);
      handleOwnedInputFocusChange(focused);
    },
    [handleOwnedInputFocusChange],
  );
  const [anchorMessageId, setAnchorMessageId] = useState<MessageId | null>(null);
  const [submittedMessageId, setSubmittedMessageId] = useState<MessageId | null>(null);
  const [endFollowEnabled, setEndFollowEnabled] = useState(true);
  const composerBottomInset = (
    Platform.OS === "android" ? isKeyboardVisible : composerExpanded || composerFocused
  )
    ? 0
    : Math.max(insets.bottom, 12);
  const contentPresentationKind = props.contentPresentation.kind;
  const realThreadSyncLabel = (() => {
    switch (props.threadSyncStatus) {
      case "empty":
      case "cached":
      case "synchronizing":
        if (contentPresentationKind === "ready") {
          return "Syncing messages...";
        }
        return contentPresentationKind === "loading" ? "Loading messages..." : null;
      default:
        return null;
    }
  })();
  const threadSyncLabel = useDelayedStatus(selectedThreadKey, realThreadSyncLabel);
  const floatingStatus = ((): FloatingWorkingStatus | null => {
    const connectionStatus = connectionFloatingStatus({
      connectionError: props.connectionError,
      connectionState: props.connectionStateLabel,
      environmentLabel: props.environmentLabel,
      onReconnect: props.onReconnectEnvironment,
    });
    if (connectionStatus !== null) {
      return connectionStatus;
    }
    if (props.activePendingApproval !== null || props.activePendingUserInput !== null) {
      return null;
    }
    if (props.creationState?.kind === "preparing") {
      if (props.worktreeSetup) return null;
      return {
        kind: "preparing",
        label: props.creationState.preparingWorktree ? "Setting up worktree…" : "Starting…",
      };
    }
    if (props.creationState?.kind === "failed") {
      return null;
    }
    if (threadSyncLabel !== null) {
      return { kind: "syncing", label: threadSyncLabel };
    }
    if (props.isCompacting && contentPresentationKind === "ready") {
      return { kind: "compacting" };
    }
    if (props.activeWorkStartedAt !== null && contentPresentationKind === "ready") {
      return { kind: "working", startedAt: props.activeWorkStartedAt };
    }
    return null;
  })();
  const showWorkingControl = floatingStatus !== null;
  const showFloatingStatus =
    showWorkingControl ||
    devicePreviews.length > 0 ||
    props.connectionStateLabel !== "connected" ||
    props.queuedMessages.length > 0 ||
    props.selectedThreadFeed.some(
      (entry) => "acknowledged" in entry && entry.acknowledged === true,
    );
  const selectedThreadFeed = props.selectedThreadFeed;
  const hasCompactableConversation =
    selectedThreadFeed.some(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "user" &&
        ((entry.message.attachments?.length ?? 0) > 0 ||
          entry.message.text.trim().toLowerCase() !== "/compact"),
    ) ||
    (Boolean(props.loadEarlier) && props.selectedThread.latestUserMessageAt !== null);
  const composerChrome = composerExpanded ? COMPOSER_EXPANDED_CHROME : COMPOSER_COLLAPSED_CHROME;
  const composerOverlapHeight = composerChrome + composerBottomInset;
  const [collapsedUserInputRequestId, setCollapsedUserInputRequestId] =
    useState<ApprovalRequestId | null>(null);
  const activeUserInputRequestId = props.activePendingUserInput?.requestId ?? null;
  const [usageLimitsPanel, setUsageLimitsPanel] = useState<{
    readonly key: string;
    readonly threadKey: string;
    readonly now: number;
  } | null>(null);
  const usageLimitsKey = [
    selectedThreadKey,
    props.selectedThread.modelSelection.instanceId,
    props.selectedThread.latestTurn?.turnId ?? "",
    props.activePendingApproval?.requestId ?? props.activePendingUserInput?.requestId ?? "",
  ].join(":");
  if (usageLimitsPanel !== null && usageLimitsPanel.key !== usageLimitsKey) {
    setUsageLimitsPanel(null);
  }
  const usageLimitsReport = useMemo(
    () =>
      usageLimitsPanel !== null && usageLimitsPanel.key === usageLimitsKey
        ? collectProviderUsageLimits(
            props.selectedThread.modelSelection.instanceId,
            props.serverConfig?.providers ?? [],
            props.serverConfig?.usageLimitSources ?? [],
            usageLimitsPanel.now,
          )
        : null,
    [
      props.selectedThread.modelSelection.instanceId,
      props.serverConfig,
      usageLimitsKey,
      usageLimitsPanel,
    ],
  );
  const showUsageLimits = useCallback(
    (report: UsageLimitsReport | null) =>
      setUsageLimitsPanel(
        report === null
          ? null
          : {
              key: usageLimitsKey,
              threadKey: selectedThreadKey,
              now: Date.parse(report.createdAt),
            },
      ),
    [selectedThreadKey, usageLimitsKey],
  );
  const dismissUsageLimits = useCallback(() => setUsageLimitsPanel(null), []);
  const clearUsageLimitsFor = useCallback(
    (threadKey: string) =>
      setUsageLimitsPanel((current) =>
        current !== null && current.threadKey === threadKey ? null : current,
      ),
    [],
  );
  const userInputCollapsed =
    activeUserInputRequestId !== null && collapsedUserInputRequestId === activeUserInputRequestId;
  const [lastKnownKeyboardHeight, setLastKnownKeyboardHeight] = useState(0);
  useEffect(() => {
    if (liveKeyboardHeight > 0 && liveKeyboardHeight !== lastKnownKeyboardHeight) {
      setLastKnownKeyboardHeight(liveKeyboardHeight);
    }
  }, [lastKnownKeyboardHeight, liveKeyboardHeight]);
  const pendingUserInputMaxHeight = derivePendingUserInputMaxHeight({
    windowHeight,
    keyboardHeight:
      lastKnownKeyboardHeight > 0 ? lastKnownKeyboardHeight : ESTIMATED_KEYBOARD_HEIGHT,
    navigationHeaderHeight,
    composerOverlapHeight: composerBottomInset,
  });
  const estimatedOverlayHeight = composerOverlapHeight;
  const nativeInsetOvercount =
    props.usesAutomaticContentInsets === true && Platform.OS === "ios" ? insets.bottom : 0;
  const { contentInsetEndAdjustment, onComposerLayout } = useKeyboardChatComposerInset(
    listRef,
    composerOverlayRef,
    Math.max(0, estimatedOverlayHeight - nativeInsetOvercount),
    -nativeInsetOvercount,
    Platform.OS === "ios" ? COMPOSER_TRANSITION_DURATION_MS : 0,
  );
  const userInputCardProgress = useSharedValue(1);
  const userInputInsetProgress = useSharedValue(1);
  const userInputCardCoverage = useSharedValue(0);
  const floatingControlCoverage = useSharedValue(
    showFloatingStatus ? FLOATING_WORKING_CONTROL_COVERAGE : 0,
  );
  useEffect(() => {
    floatingControlCoverage.value = withTiming(
      showFloatingStatus ? FLOATING_WORKING_CONTROL_COVERAGE : 0,
      { duration: 180, reduceMotion: ReduceMotion.System },
    );
  }, [floatingControlCoverage, showFloatingStatus]);
  const userInputCoverageApplies = Platform.OS === "ios" && activeUserInputRequestId !== null;
  const combinedContentInsetEndAdjustment = useSharedValue(
    Math.max(0, estimatedOverlayHeight - nativeInsetOvercount),
  );
  useAnimatedReaction(
    () =>
      contentInsetEndAdjustment.value +
      floatingControlCoverage.value +
      (userInputCoverageApplies ? userInputInsetProgress.value * userInputCardCoverage.value : 0),
    (value) => {
      combinedContentInsetEndAdjustment.value = value;
    },
    [userInputCoverageApplies],
  );
  const { freeze, scrollMessageToEnd } = useKeyboardScrollToEnd({ listRef });
  const endFollowEnabledRef = useRef(true);
  endFollowEnabledRef.current = endFollowEnabled;
  const overlayRepinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousWorkingControlStateRef = useRef({
    threadKey: selectedThreadKey,
    visible: false,
  });
  const scheduleOverlayRepin = useCallback(
    (delayMs: number) => {
      if (overlayRepinTimerRef.current !== null) {
        clearTimeout(overlayRepinTimerRef.current);
      }
      overlayRepinTimerRef.current = setTimeout(() => {
        overlayRepinTimerRef.current = null;
        if (!endFollowEnabledRef.current) {
          return;
        }
        void scrollMessageToEnd({ animated: false, closeKeyboard: false }).catch(() => {
          freeze.set(false);
        });
      }, delayMs);
    },
    [freeze, scrollMessageToEnd],
  );
  useEffect(
    () => () => {
      if (overlayRepinTimerRef.current !== null) {
        clearTimeout(overlayRepinTimerRef.current);
      }
    },
    [],
  );
  useEffect(() => {
    const previous = previousWorkingControlStateRef.current;
    const threadChanged = previous.threadKey !== selectedThreadKey;
    const visibilityChanged = previous.visible !== showFloatingStatus;
    previousWorkingControlStateRef.current = {
      threadKey: selectedThreadKey,
      visible: showFloatingStatus,
    };
    if ((!threadChanged && !visibilityChanged) || (threadChanged && !showFloatingStatus)) {
      return;
    }
    scheduleOverlayRepin(230);
  }, [scheduleOverlayRepin, selectedThreadKey, showFloatingStatus]);
  const handleToggleUserInputCollapsed = useCallback(() => {
    if (activeUserInputRequestId === null) {
      return;
    }
    if (userInputCollapsed) {
      userInputCardProgress.value = withTiming(1, USER_INPUT_TOGGLE_TIMING);
      userInputInsetProgress.value = withTiming(1, USER_INPUT_TOGGLE_TIMING);
      setCollapsedUserInputRequestId(null);
      scheduleOverlayRepin(USER_INPUT_TOGGLE_DURATION_MS + 50);
    } else {
      Keyboard.dismiss();
      userInputCardProgress.value = withTiming(0, USER_INPUT_TOGGLE_TIMING);
      userInputInsetProgress.value = 0;
      setCollapsedUserInputRequestId(activeUserInputRequestId);
      scheduleOverlayRepin(60);
    }
  }, [
    activeUserInputRequestId,
    scheduleOverlayRepin,
    userInputCardProgress,
    userInputCollapsed,
    userInputInsetProgress,
  ]);
  useEffect(() => {
    userInputCardProgress.value = 1;
    userInputInsetProgress.value = 1;
  }, [activeUserInputRequestId, userInputCardProgress, userInputInsetProgress]);
  const showContent = props.showContent ?? true;
  const layoutVariant = props.layoutVariant ?? "compact";
  const isSplitLayout = layoutVariant === "split";
  const contentMaxWidth = isSplitLayout ? CHAT_CONTENT_MAX_WIDTH : undefined;
  const workspaceContentWidth = useWorkspaceContentWidth();
  const composerWidthStyle = useAnimatedStyle(() =>
    isSplitLayout && workspaceContentWidth !== null
      ? { width: workspaceContentWidth.value }
      : { width: "100%" },
  );
  const selectedInstanceId = props.selectedThread.modelSelection.instanceId;
  useStreamingHaptics(props.selectedThread.id, props.selectedThreadFeed);
  const selectedProviderSkills = useMemo(() => {
    const provider = props.serverConfig?.providers.find(
      (candidate) => candidate.instanceId === selectedInstanceId,
    );
    return provider
      ? resolveProviderSkillsForCwd(provider, props.threadCwd ?? props.projectWorkspaceRoot)
      : [];
  }, [props.projectWorkspaceRoot, props.serverConfig, props.threadCwd, selectedInstanceId]);

  useLayoutEffect(() => {
    selectedThreadKeyRef.current = selectedThreadKey;
    setComposerFocused(false);
  }, [selectedThreadKey, showContent]);

  useEffect(() => {
    setAnchorMessageId(null);
    setSubmittedMessageId(null);
    lastScrolledSubmittedMessageIdRef.current = null;
    setEndFollowEnabled(true);
    freeze.set(false);
  }, [freeze, selectedThreadKey]);

  useEffect(() => {
    if (
      submittedMessageId === null ||
      anchorMessageId !== submittedMessageId ||
      lastScrolledSubmittedMessageIdRef.current === submittedMessageId ||
      contentPresentationKind !== "ready" ||
      (!selectedThreadFeed.some(
        (entry) => entry.type === "message" && entry.id === submittedMessageId,
      ) &&
        !props.queuedMessages.some((message) => message.messageId === submittedMessageId))
    ) {
      return;
    }

    const targetThreadKey = selectedThreadKey;
    const frame = requestAnimationFrame(() => {
      if (selectedThreadKeyRef.current !== targetThreadKey) {
        return;
      }
      lastScrolledSubmittedMessageIdRef.current = submittedMessageId;
      void KeyboardController.dismiss()
        .then(() => {
          if (
            selectedThreadKeyRef.current !== targetThreadKey ||
            lastScrolledSubmittedMessageIdRef.current !== submittedMessageId
          ) {
            return;
          }
          return scrollMessageToEnd({ animated: true, closeKeyboard: false });
        })
        .catch(() => {
          if (
            selectedThreadKeyRef.current !== targetThreadKey ||
            lastScrolledSubmittedMessageIdRef.current !== submittedMessageId
          ) {
            return;
          }
          lastScrolledSubmittedMessageIdRef.current = null;
          freeze.set(false);
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    anchorMessageId,
    submittedMessageId,
    freeze,
    contentPresentationKind,
    props.queuedMessages,
    selectedThreadFeed,
    scrollMessageToEnd,
    selectedThreadKey,
  ]);

  const handleSendMessage = useCallback(async () => {
    const targetThreadKey = selectedThreadKey;
    const hasUserMessage = selectedThreadFeed.some(
      (entry) => entry.type === "message" && entry.message.role === "user",
    );
    const messageId = await props.onSendMessage();
    if (messageId === null || selectedThreadKeyRef.current !== targetThreadKey) {
      return messageId;
    }

    clearUsageLimitsFor(targetThreadKey);

    setSubmittedMessageId(messageId);
    setAnchorMessageId(
      resolveThreadFeedSubmissionAnchor({
        currentAnchorMessageId: anchorMessageId,
        submittedMessageId: messageId,
        hasStartedTurn: props.selectedThread.latestTurn !== null,
        hasUserMessage,
        queuedMessageCount: props.selectedThreadQueueCount,
      }),
    );
    composerEditorRef.current?.blur();
    return messageId;
  }, [
    anchorMessageId,
    clearUsageLimitsFor,
    props.onSendMessage,
    props.selectedThread.latestTurn,
    props.selectedThreadQueueCount,
    selectedThreadFeed,
    selectedThreadKey,
  ]);

  const handleEditPendingMessage = useCallback(async (message: QueuedThreadMessage) => {
    try {
      if (
        (await editPendingThreadMessage(message)) &&
        selectedThreadKeyRef.current === scopedThreadKey(message.environmentId, message.threadId)
      ) {
        composerEditorRef.current?.focus();
      }
    } catch (error) {
      Alert.alert(
        "Could not edit message",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }, []);

  const collapseComposer = useCallback(() => {
    composerEditorRef.current?.blur();
  }, []);

  const handleUseArtifactTemplate = useCallback(
    (template: CodexArtifactTemplate) => {
      const currentDraft = draftMessageRef.current;
      const nextDraft = appendCodexArtifactTemplateUsePrompt(currentDraft, template);
      if (nextDraft !== currentDraft) {
        draftMessageRef.current = nextDraft;
        props.onChangeDraftMessage(nextDraft);
      }
      requestAnimationFrame(() => {
        composerEditorRef.current?.focus();
        composerEditorRef.current?.setSelection({ start: nextDraft.length, end: nextDraft.length });
      });
    },
    [props.onChangeDraftMessage],
  );

  const handleScrollToEnd = useCallback(() => {
    void Haptics.selectionAsync();
    void scrollMessageToEnd({ animated: true, closeKeyboard: false }).catch(() => {
      freeze.set(false);
    });
  }, [freeze, scrollMessageToEnd]);

  const showScrollToEndButton = contentPresentationKind === "ready" && !endFollowEnabled;
  const { themeAppearance } = useAppearancePreferences();
  const isDarkMode = themeAppearance === "dark";

  const handleFeedTouchStart = useCallback((event: GestureResponderEvent) => {
    feedTouchStartRef.current = {
      pageX: event.nativeEvent.pageX,
      pageY: event.nativeEvent.pageY,
    };
  }, []);

  const handleFeedTouchMove = useCallback((event: GestureResponderEvent) => {
    const start = feedTouchStartRef.current;
    if (!start) {
      return;
    }
    const deltaX = event.nativeEvent.pageX - start.pageX;
    const deltaY = event.nativeEvent.pageY - start.pageY;
    if (Math.hypot(deltaX, deltaY) > 8) {
      feedTouchStartRef.current = null;
    }
  }, []);

  const handleFeedTouchEnd = useCallback(() => {
    if (feedTouchStartRef.current) {
      collapseComposer();
    }
    feedTouchStartRef.current = null;
  }, [collapseComposer]);

  const handleFeedTouchCancel = useCallback(() => {
    feedTouchStartRef.current = null;
  }, []);

  return (
    <View className="flex-1">
      {showContent ? (
        <View
          style={{ flex: 1 }}
          onTouchStart={handleFeedTouchStart}
          onTouchMove={handleFeedTouchMove}
          onTouchEnd={handleFeedTouchEnd}
          onTouchCancel={handleFeedTouchCancel}
        >
          <View
            pointerEvents="none"
            className={
              Platform.OS === "android"
                ? "absolute inset-0 bg-thread-canvas"
                : "absolute inset-0 bg-screen"
            }
          />
          <RenderErrorBoundary
            key={selectedThreadKey}
            resetKeys={[props.threadCwd]}
            renderFallback={(fallback) => (
              <RenderFailureView
                {...fallback}
                title="The conversation couldn't be displayed"
                bottomInset={estimatedOverlayHeight}
              />
            )}
          >
            <ThreadFeed
              environmentId={props.environmentId}
              threadId={props.selectedThread.id}
              workspaceRoot={props.threadCwd}
              feed={props.selectedThreadFeed}
              worktreeSetup={props.worktreeSetup}
              setupWorkingStartedAt={props.setupWorkingStartedAt}
              queuedMessages={props.queuedMessages}
              dispatchingMessageId={props.dispatchingMessageId}
              onEditPendingMessage={handleEditPendingMessage}
              contentPresentation={props.contentPresentation}
              agentLabel={agentLabel}
              latestTurn={props.selectedThread.latestTurn}
              activeWorkStartedAt={props.activeWorkStartedAt}
              listRef={listRef}
              freeze={freeze}
              anchorMessageId={anchorMessageId}
              submittedMessageId={submittedMessageId}
              contentInsetEndAdjustment={combinedContentInsetEndAdjustment}
              contentTopInset={0}
              contentBottomInset={
                estimatedOverlayHeight +
                (showFloatingStatus ? FLOATING_WORKING_CONTROL_COVERAGE : 0)
              }
              contentMaxWidth={contentMaxWidth}
              layoutVariant={layoutVariant}
              usesAutomaticContentInsets={props.usesAutomaticContentInsets}
              onHeaderMaterialVisibilityChange={props.onHeaderMaterialVisibilityChange}
              onEndFollowEnabledChange={setEndFollowEnabled}
              skills={selectedProviderSkills}
              onUseArtifactTemplate={handleUseArtifactTemplate}
              loadEarlier={props.loadEarlier ?? null}
            />
          </RenderErrorBoundary>
        </View>
      ) : (
        <View className="flex-1" />
      )}

      {showContent ? (
        <KeyboardStickyView
          enabled={Platform.OS === "ios" || (isKeyboardVisible && !keyboardStateSuspect)}
          pointerEvents="box-none"
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, top: 0 }}
          offset={{ closed: 0, opened: 0 }}
        >
          <Animated.View
            layout={COMPOSER_LAYOUT_TRANSITION}
            pointerEvents="box-none"
            style={[{ position: "absolute", bottom: 0, left: 0 }, composerWidthStyle]}
          >
            <View ref={composerOverlayRef} onLayout={onComposerLayout} className="w-full">
              <FloatingWorkingControl
                colorScheme={isDarkMode ? "dark" : "light"}
                status={floatingStatus}
                devicePreview={
                  devicePreviews.length > 0
                    ? { count: devicePreviews.length, onPress: openDevicePreview }
                    : null
                }
                showScrollToEnd={showScrollToEndButton}
                onScrollToEnd={handleScrollToEnd}
              />
              <View className="w-full self-center" style={{ maxWidth: contentMaxWidth }}>
                {props.feedbackSubmissions.map((submission) => (
                  <ComposerFeedback
                    key={submission.id}
                    submission={submission}
                    onDismiss={() => props.onDismissFeedback(submission.id)}
                  />
                ))}
                {usageLimitsReport && activeUserInputRequestId === null ? (
                  <Animated.View
                    className="shrink-0 px-4 pb-3"
                    entering={FadeInDown.duration(220)}
                    exiting={FadeOut.duration(140)}
                  >
                    <ComposerUsageLimits
                      report={usageLimitsReport}
                      environmentId={props.environmentId}
                      onClose={dismissUsageLimits}
                    />
                  </Animated.View>
                ) : null}
                {props.creationState?.kind === "failed" ? (
                  <Animated.View
                    className="shrink-0 px-4"
                    style={{ paddingBottom: composerBottomInset }}
                    entering={FadeInDown.duration(220)}
                    exiting={FadeOut.duration(140)}
                  >
                    <ThreadCreationFailedCard
                      reason={props.creationState.reason}
                      onEditTask={props.creationState.onEditTask}
                    />
                  </Animated.View>
                ) : null}
                {props.activePendingApproval || props.activePendingUserInput ? (
                  <Animated.View
                    className="shrink-0 gap-3 px-4 pb-3"
                    style={
                      activeUserInputRequestId !== null
                        ? { paddingBottom: composerBottomInset }
                        : undefined
                    }
                    entering={FadeInDown.duration(220)}
                    exiting={FadeOut.duration(140)}
                  >
                    {props.activePendingApproval ? (
                      <PendingApprovalCard
                        approval={props.activePendingApproval}
                        respondingApprovalId={props.respondingApprovalId}
                        onRespond={props.onRespondToApproval}
                      />
                    ) : null}
                    {props.activePendingUserInput ? (
                      <PendingUserInputCard
                        pendingUserInput={props.activePendingUserInput}
                        maxHeight={pendingUserInputMaxHeight}
                        collapsed={userInputCollapsed}
                        onToggleCollapsed={handleToggleUserInputCollapsed}
                        onStopThread={props.onStopThread}
                        cardProgress={userInputCardProgress}
                        cardCoverage={userInputCardCoverage}
                        onInputFocusChange={handleOwnedInputFocusChange}
                        drafts={props.activePendingUserInputDrafts}
                        answers={props.activePendingUserInputAnswers}
                        respondingUserInputId={props.respondingUserInputId}
                        onSelectOption={props.onSelectUserInputOption}
                        onChangeCustomAnswer={props.onChangeUserInputCustomAnswer}
                        onSubmit={props.onSubmitUserInput}
                        onDismiss={props.onDismissUserInput}
                      />
                    ) : null}
                  </Animated.View>
                ) : null}
              </View>

              <View
                style={
                  activeUserInputRequestId !== null || props.creationState?.kind === "failed"
                    ? { display: "none" }
                    : undefined
                }
              >
                <ThreadComposer
                  editorRef={composerEditorRef}
                  draftMessage={props.draftMessage}
                  draftAttachments={props.draftAttachments}
                  placeholder="Ask the repo agent, or run a command…"
                  contentMaxWidth={contentMaxWidth}
                  connectionState={props.connectionStateLabel}
                  environmentLabel={props.environmentLabel}
                  selectedThread={props.selectedThread}
                  hasCompactableConversation={hasCompactableConversation && !props.isCompacting}
                  serverConfig={props.serverConfig}
                  queueCount={props.selectedThreadQueueCount}
                  environmentId={props.environmentId}
                  projectCwd={props.threadCwd ?? props.projectWorkspaceRoot}
                  sendBlockedReason={
                    props.creationState?.kind === "preparing" ? "Starting the task…" : null
                  }
                  bottomInset={composerBottomInset}
                  onChangeDraftMessage={props.onChangeDraftMessage}
                  onPickDraftMedia={props.onPickDraftMedia}
                  onPickDraftFiles={props.onPickDraftFiles}
                  onNativePasteImages={props.onNativePasteImages}
                  onNativePasteText={props.onNativePasteText}
                  onRemoveDraftImage={props.onRemoveDraftImage}
                  onStopThread={props.onStopThread}
                  onSendMessage={handleSendMessage}
                  onShowUsageLimits={showUsageLimits}
                  onUpdateModelSelection={props.onUpdateThreadModelSelection}
                  onUpdateRuntimeMode={props.onUpdateThreadRuntimeMode}
                  onUpdateInteractionMode={props.onUpdateThreadInteractionMode}
                  onExpandedChange={setComposerExpanded}
                  onEditorFocusChange={handleComposerFocusChange}
                />
              </View>
            </View>
          </Animated.View>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
});

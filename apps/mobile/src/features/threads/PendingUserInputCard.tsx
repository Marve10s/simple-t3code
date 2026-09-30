import { RequestActionButton } from "./RequestActionButton";
import { QuestionAttachments } from "./QuestionAttachments";
import type { ApprovalRequestId, UserInputQuestion } from "@t3tools/contracts";
import { useCallback, useRef } from "react";
import { Platform, Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  FadeInUp,
  FadeOutDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { USER_INPUT_TOGGLE_DURATION_MS } from "./pendingUserInputLayout";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { ControlPill } from "../../components/ControlPill";
import { cn } from "../../lib/cn";
import {
  isPendingUserInputOptionSelected,
  type PendingUserInput,
  type PendingUserInputDraftAnswer,
} from "../../lib/threadActivity";

export interface PendingUserInputCardProps {
  readonly pendingUserInput: PendingUserInput;
  readonly maxHeight: number;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly onStopThread?: () => void;
  readonly cardProgress?: SharedValue<number>;
  readonly cardCoverage?: SharedValue<number>;
  readonly onInputFocusChange?: (focused: boolean) => void;
  readonly drafts: Record<string, PendingUserInputDraftAnswer>;
  readonly answers: Record<string, string | ReadonlyArray<string>> | null;
  readonly respondingUserInputId: ApprovalRequestId | null;
  readonly onSelectOption: (
    requestId: ApprovalRequestId,
    question: UserInputQuestion,
    value: string,
  ) => void;
  readonly onChangeCustomAnswer: (
    requestId: ApprovalRequestId,
    questionId: string,
    customAnswer: string,
  ) => void;
  readonly onSubmit: () => Promise<unknown>;
  readonly onDismiss: () => Promise<unknown>;
}

const EXPANDED_CARD_IS_OVERLAY = Platform.OS === "ios";

const CARD_LAYOUT_TRANSITION = LinearTransition.duration(200);

export function PendingUserInputCard(props: PendingUserInputCardProps) {
  const questionCount = props.pendingUserInput.questions.length;

  const cardCoverage = props.cardCoverage;
  const barHeightRef = useRef(0);
  const cardHeightRef = useRef(0);
  const cardHeight = useSharedValue(0);
  const notifyCoverage = useCallback(() => {
    if (!cardCoverage) {
      return;
    }
    const coverage = Math.max(0, cardHeightRef.current - barHeightRef.current);
    if (coverage === cardCoverage.value) {
      return;
    }
    if (cardCoverage.value === 0) {
      cardCoverage.value = coverage;
      return;
    }
    cardCoverage.value = withTiming(coverage, {
      duration: USER_INPUT_TOGGLE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [cardCoverage]);
  const handleBarLayout = useCallback(
    (event: LayoutChangeEvent) => {
      barHeightRef.current = event.nativeEvent.layout.height;
      notifyCoverage();
    },
    [notifyCoverage],
  );
  const handleCardLayout = useCallback(
    (event: LayoutChangeEvent) => {
      cardHeightRef.current = event.nativeEvent.layout.height;
      cardHeight.value = event.nativeEvent.layout.height;
      notifyCoverage();
    },
    [cardHeight, notifyCoverage],
  );
  const cardProgress = props.cardProgress;
  const cardAnimatedStyle = useAnimatedStyle(() => {
    const progress = cardProgress === undefined ? 1 : cardProgress.value;
    return {
      transform: [{ translateY: (1 - progress) * cardHeight.value }],
    };
  });

  const renderCard = EXPANDED_CARD_IS_OVERLAY || !props.collapsed;
  const showBar = props.collapsed || EXPANDED_CARD_IS_OVERLAY;
  const bar = showBar ? (
    <View
      onLayout={handleBarLayout}
      pointerEvents={props.collapsed ? "auto" : "none"}
      accessibilityElementsHidden={!props.collapsed}
      importantForAccessibility={props.collapsed ? "auto" : "no-hide-descendants"}
      className="flex-row items-center gap-2 rounded-full border border-border bg-card-alt py-1.5 pl-4 pr-1.5"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Expand user input, ${questionCount} question${
          questionCount === 1 ? "" : "s"
        }`}
        onPress={props.onToggleCollapsed}
        className="min-h-10 flex-1 flex-row items-center gap-2 active:opacity-70"
      >
        <Text className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-foreground-secondary">
          User input needed
        </Text>
        <Text className="font-sans text-xs text-foreground-muted">
          {questionCount} question{questionCount === 1 ? "" : "s"}
        </Text>
        <View className="flex-1" />
        <SymbolView
          name="chevron.up"
          size={12}
          tintColorClassName={"accent-icon-subtle"}
          type="monochrome"
        />
      </Pressable>
      {props.onStopThread ? (
        <ControlPill
          accessibilityLabel="Stop"
          icon="stop.fill"
          variant="danger"
          className="h-9 w-9"
          onPress={props.onStopThread}
        />
      ) : null}
    </View>
  ) : null;
  const card = renderCard ? (
    <Animated.View
      onLayout={handleCardLayout}
      pointerEvents={props.collapsed ? "none" : "auto"}
      accessibilityElementsHidden={props.collapsed}
      importantForAccessibility={props.collapsed ? "no-hide-descendants" : "auto"}
      entering={
        EXPANDED_CARD_IS_OVERLAY
          ? undefined
          : FadeInUp.duration(USER_INPUT_TOGGLE_DURATION_MS).easing(Easing.out(Easing.cubic))
      }
      exiting={
        EXPANDED_CARD_IS_OVERLAY
          ? undefined
          : FadeOutDown.duration(USER_INPUT_TOGGLE_DURATION_MS).easing(Easing.out(Easing.cubic))
      }
      layout={CARD_LAYOUT_TRANSITION}
      className="overflow-hidden gap-2.5 rounded-[20px] border border-border bg-card-alt p-4"
      style={
        EXPANDED_CARD_IS_OVERLAY
          ? [{ maxHeight: props.maxHeight }, cardAnimatedStyle]
          : { maxHeight: props.maxHeight }
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Collapse user input"
        onPress={props.onToggleCollapsed}
        className="flex-row items-start gap-2"
      >
        <View className="flex-1 gap-2.5">
          <Text className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-foreground-secondary">
            User input needed
          </Text>
          <Text className="font-t3-bold text-lg text-foreground">Fill in the pending answers</Text>
        </View>
        <View className="h-8 w-8 items-center justify-center rounded-full bg-subtle-strong">
          <SymbolView
            name="chevron.down"
            size={13}
            tintColorClassName={"accent-icon-subtle"}
            type="monochrome"
          />
        </View>
      </Pressable>
      <ScrollView
        bounces={false}
        className="min-h-0"
        contentContainerClassName="gap-2.5 pb-1"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
        style={{ flexShrink: 1 }}
      >
        {props.pendingUserInput.questions.map((question) => {
          const draft = props.drafts[question.id];
          return (
            <View key={question.id} className="gap-2 pt-1">
              <Text className="font-t3-bold text-xs uppercase tracking-[1px] text-foreground-muted">
                {question.header}
              </Text>
              <Text className="font-sans text-base leading-snug text-foreground">
                {question.question}
              </Text>
              <View className="gap-2">
                {question.options.map((option) => {
                  const optionValue = option.value ?? option.label.trim();
                  const selected = isPendingUserInputOptionSelected(question, draft, optionValue);
                  const description =
                    option.description !== option.label ? option.description : undefined;
                  return (
                    <Pressable
                      key={optionValue}
                      className={cn(
                        "min-h-12 w-full rounded-2xl border px-3.5 py-3",
                        selected ? "border-primary bg-primary/10" : "border-border bg-input",
                      )}
                      onPress={() =>
                        props.onSelectOption(
                          props.pendingUserInput.requestId,
                          question,
                          optionValue,
                        )
                      }
                    >
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text
                          className={cn(
                            "font-t3-bold text-sm",
                            selected ? "text-foreground" : "text-foreground-secondary",
                          )}
                        >
                          {option.label}
                        </Text>
                        {description ? (
                          <Text className="font-sans text-sm leading-5 text-foreground-muted">
                            {description}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <QuestionAttachments
                requestId={props.pendingUserInput.requestId}
                question={question}
                questions={props.pendingUserInput.questions}
                disabled={props.respondingUserInputId === props.pendingUserInput.requestId}
                value={draft?.customAnswer ?? ""}
                onChangeText={(value) =>
                  props.onChangeCustomAnswer(props.pendingUserInput.requestId, question.id, value)
                }
                onInputFocusChange={props.onInputFocusChange}
              />
            </View>
          );
        })}
      </ScrollView>
      <RequestActionButton
        label="Submit answers"
        size="large"
        tone={props.answers ? "primary" : "secondary"}
        disabled={
          props.answers === null || props.respondingUserInputId === props.pendingUserInput.requestId
        }
        onPress={() => void props.onSubmit()}
      />
      {props.pendingUserInput.dismissible ? (
        <Pressable
          accessibilityRole="button"
          className="items-center justify-center rounded-2xl px-4 py-2.5 active:opacity-70"
          disabled={props.respondingUserInputId === props.pendingUserInput.requestId}
          onPress={() => void props.onDismiss()}
        >
          <Text className="font-t3-bold text-sm text-foreground-muted">
            Dismiss without answering
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  ) : null;
  return (
    <View className="relative">
      {bar}
      {EXPANDED_CARD_IS_OVERLAY ? (
        <View
          pointerEvents={props.collapsed ? "none" : "box-none"}
          className="absolute inset-x-0 bottom-0 justify-end overflow-hidden"
          style={{ height: props.maxHeight }}
        >
          {card}
        </View>
      ) : (
        card
      )}
    </View>
  );
}

import { HStack, Image, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import type { ComponentProps } from "react";
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  layoutPriority,
  lineLimit,
  padding,
  resizable,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import {
  createLiveActivity,
  type LiveActivityComponent,
  type LiveActivityLayout,
} from "expo-widgets";

type LiveActivityEnvironment = Parameters<LiveActivityComponent<AgentActivityProps>>[1];

export type AgentActivityPhase =
  | "starting"
  | "running"
  | "waiting_for_approval"
  | "waiting_for_input"
  | "completed"
  | "failed"
  | "stale";

export interface AgentActivityRowProps {
  readonly environmentId: string;
  readonly threadId: string;
  readonly projectTitle: string;
  readonly threadTitle: string;
  readonly modelTitle: string;
  readonly phase: AgentActivityPhase;
  readonly status: string;
  readonly updatedAt: string;
  readonly deepLink: string;
}

export interface AgentActivityProps {
  readonly title: string;
  readonly subtitle: string;
  readonly activeCount: number;
  readonly updatedAt: string;
  readonly activities: ReadonlyArray<AgentActivityRowProps>;
}

export function AgentActivity(
  props: AgentActivityProps,
  environment: LiveActivityEnvironment,
): LiveActivityLayout {
  "widget";

  type Foreground = Parameters<typeof foregroundStyle>[0];
  const primaryForeground = { type: "hierarchical", style: "primary" } as const;
  const secondaryForeground = { type: "hierarchical", style: "secondary" } as const;
  const monochrome =
    environment.widgetRenderingMode === "accented" || environment.widgetRenderingMode === "vibrant";

  const isLightScheme = environment.colorScheme === "light";
  const phaseTint = (phase: AgentActivityPhase | undefined): Foreground => {
    if (environment.isLuminanceReduced) {
      return secondaryForeground;
    }
    if (monochrome) {
      return primaryForeground;
    }
    switch (phase) {
      case "waiting_for_approval":
        return isLightScheme ? "#d97706" : "#fcd34d";
      case "waiting_for_input":
        return isLightScheme ? "#4f46e5" : "#a5b4fc";
      case "failed":
        return isLightScheme ? "#dc2626" : "#fca5a5";
      case "completed":
        return isLightScheme ? "#059669" : "#6ee7b7";
      case "starting":
      case "running":
      default:
        return isLightScheme ? "#0284c7" : "#7dd3fc";
    }
  };

  const phasePriority = (phase: AgentActivityPhase): number => {
    if (phase === "waiting_for_approval" || phase === "waiting_for_input") return 0;
    if (phase === "failed") return 1;
    if (phase === "running" || phase === "starting") return 2;
    return 3;
  };
  const ordered = [...props.activities].sort(
    (a, b) => phasePriority(a.phase) - phasePriority(b.phase),
  );
  const row0 = ordered[0];
  const row1 = ordered[1];
  const row2 = ordered[2];
  const row3 = ordered[3];
  const row4 = ordered[4];

  const attentionRows = props.activities.filter(
    (row) => row.phase === "waiting_for_approval" || row.phase === "waiting_for_input",
  );
  const attentionRow = attentionRows[0];
  const failedRow = props.activities.find((row) => row.phase === "failed");
  const heroRow = attentionRow ?? failedRow ?? row0;
  const tint = phaseTint(heroRow?.phase);
  const headerTint = attentionRow
    ? phaseTint(attentionRow.phase)
    : failedRow
      ? phaseTint(failedRow.phase)
      : tint;

  const allDone = props.activeCount === 0;
  const doneLabel = failedRow ? "Failed" : "Done";
  const outcomeLabel = failedRow ? "Agent work failed" : "Agent work completed";

  const agentWord = props.activeCount === 1 ? "agent" : "agents";
  const agentsLabel = allDone ? outcomeLabel : `${props.activeCount} active ${agentWord}`;
  const attentionSuffix =
    attentionRows.length > 0
      ? `${attentionRows.length} need${attentionRows.length === 1 ? "s" : ""} attention`
      : "";
  const activeLabel = allDone ? doneLabel : `${props.activeCount} active`;
  const summary = attentionSuffix || activeLabel;

  const deepLinkRow = attentionRow ?? row0;
  const deepLink =
    deepLinkRow && deepLinkRow.deepLink.startsWith("/") && !deepLinkRow.deepLink.startsWith("//")
      ? `t3code://${deepLinkRow.deepLink.slice(1)}`
      : null;

  type SFName = NonNullable<ComponentProps<typeof Image>["systemName"]>;
  const phaseSymbol = (phase: AgentActivityPhase): SFName => {
    switch (phase) {
      case "waiting_for_approval":
        return "exclamationmark.circle.fill";
      case "waiting_for_input":
        return "questionmark.circle.fill";
      case "failed":
        return "xmark.octagon.fill";
      case "completed":
        return "checkmark.circle.fill";
      case "starting":
        return "circle.dotted";
      case "stale":
        return "clock.arrow.circlepath";
      case "running":
      default:
        return "arrow.triangle.2.circlepath";
    }
  };

  const renderGlyph = (systemName: SFName, size: number, color: Foreground) => (
    <HStack modifiers={[frame({ width: size, height: size }), foregroundStyle(color)]}>
      <Image systemName={systemName} modifiers={[resizable()]} />
    </HStack>
  );

  const renderCompactRow = (row: AgentActivityRowProps) => (
    <HStack spacing={7} alignment="center">
      <Text
        modifiers={[
          font({ weight: "semibold", size: 13 }),
          foregroundStyle(primaryForeground),
          lineLimit(1),
        ]}
      >
        {row.threadTitle}
      </Text>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(secondaryForeground), lineLimit(1)]}>
        {row.projectTitle}
      </Text>
      <Spacer minLength={8} />
      <Text
        modifiers={[
          font({ weight: "semibold", size: 11 }),
          foregroundStyle(phaseTint(row.phase)),
          layoutPriority(1),
        ]}
      >
        {row.status}
      </Text>
    </HStack>
  );

  const renderLogo = (height: number, color: Foreground) => (
    <HStack modifiers={[frame({ width: height * 1.5, height }), foregroundStyle(color)]}>
      <Image assetName="T3Mark" modifiers={[resizable()]} />
    </HStack>
  );

  return {
    banner: (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[
          padding({ all: 14 }),
          activityBackgroundTint(environment.isLiquidGlassAvailable ? "clear" : null),
          ...(deepLink ? [widgetURL(deepLink)] : []),
        ]}
      >
        <ZStack>
          <HStack spacing={0} alignment="center">
            {renderLogo(13, primaryForeground)}
            <Spacer minLength={0} />
          </HStack>
          <HStack spacing={6} alignment="center">
            <Spacer minLength={0} />
            <Text
              modifiers={[
                font({ weight: "semibold", size: 13 }),
                foregroundStyle(allDone ? headerTint : primaryForeground),
                lineLimit(1),
              ]}
            >
              {agentsLabel}
            </Text>
            {attentionSuffix ? (
              <Text modifiers={[font({ size: 13 }), foregroundStyle(secondaryForeground)]}>·</Text>
            ) : null}
            {attentionSuffix ? (
              <Text
                modifiers={[
                  font({ weight: "semibold", size: 13 }),
                  foregroundStyle(headerTint),
                  lineLimit(1),
                ]}
              >
                {attentionSuffix}
              </Text>
            ) : null}
            <Spacer minLength={0} />
          </HStack>
        </ZStack>
        {row0 ? renderCompactRow(row0) : null}
        {row1 ? renderCompactRow(row1) : null}
        {row2 ? renderCompactRow(row2) : null}
        {row3 ? renderCompactRow(row3) : null}
        {row4 ? renderCompactRow(row4) : null}
      </VStack>
    ),
    bannerSmall: (
      <VStack alignment="leading" spacing={5} modifiers={[padding({ all: 10 })]}>
        <HStack spacing={7} alignment="center">
          {renderLogo(14, primaryForeground)}
          <Text
            modifiers={[
              font({ weight: "bold", size: 13 }),
              foregroundStyle(headerTint),
              lineLimit(1),
            ]}
          >
            {attentionRows.length > 0 ? summary : activeLabel}
          </Text>
          <Spacer minLength={6} />
        </HStack>
        {row0 ? (
          <HStack spacing={7} alignment="center">
            <Text
              modifiers={[
                font({ weight: "semibold", size: 12 }),
                foregroundStyle(primaryForeground),
                lineLimit(1),
              ]}
            >
              {row0.threadTitle}
            </Text>
            <Spacer minLength={6} />
            <Text modifiers={[font({ size: 11 }), foregroundStyle(phaseTint(row0.phase))]}>
              {row0.status}
            </Text>
          </HStack>
        ) : null}
      </VStack>
    ),
    compactLeading: renderLogo(14, tint),
    compactTrailing: (
      <Text modifiers={[font({ weight: "semibold", size: 11 }), foregroundStyle(tint)]}>
        {attentionRow
          ? attentionRow.phase === "waiting_for_approval"
            ? "Approval"
            : "Input"
          : activeLabel}
      </Text>
    ),
    minimal:
      (attentionRow || failedRow || allDone) && heroRow
        ? renderGlyph(phaseSymbol(heroRow.phase), 13, phaseTint(heroRow.phase))
        : renderLogo(11, tint),
    expandedLeading: (
      <HStack spacing={5} alignment="center" modifiers={[padding({ leading: 4, vertical: 4 })]}>
        {renderLogo(15, tint)}
        <Text modifiers={[font({ weight: "bold", size: 13 }), foregroundStyle(tint)]}>
          {allDone ? doneLabel : `${props.activeCount}`}
        </Text>
      </HStack>
    ),
    expandedCenter: null,
    expandedTrailing: null,
    expandedBottom: (
      <VStack
        alignment="leading"
        spacing={5}
        modifiers={
          deepLink
            ? [padding({ vertical: 2, horizontal: 8 }), widgetURL(deepLink)]
            : [padding({ vertical: 2, horizontal: 8 })]
        }
      >
        {row0 ? renderCompactRow(row0) : null}
        {row1 ? renderCompactRow(row1) : null}
        {row2 ? renderCompactRow(row2) : null}
      </VStack>
    ),
  };
}

export default createLiveActivity<AgentActivityProps>("AgentActivity", AgentActivity);

import type { UsageProviderKind } from "@t3tools/contracts";

import {
  AntigravityIcon,
  ClaudeAI,
  CursorIcon,
  GrokIcon,
  type Icon,
  OpenAI,
  OpenCodeIcon,
} from "../Icons";

type UsageProviderPresentation = {
  readonly label: string;
  readonly color: string;
  readonly mark: Icon;
};

export const PROVIDER_PRESENTATION = {
  codex: {
    label: "Codex",
    color: "var(--contrast-foreground)",
    mark: OpenAI,
  },
  claude: {
    label: "Claude Code",
    color: "#d97757",
    mark: ClaudeAI,
  },
  grok: {
    label: "Grok Build",
    color: "color-mix(in oklab, var(--contrast-foreground) 72%, var(--background))",
    mark: GrokIcon,
  },
  cursor: { label: "Cursor", color: "#8b8b8b", mark: CursorIcon },
  opencode: { label: "OpenCode", color: "#5b9bbd", mark: OpenCodeIcon },
  antigravity: { label: "Antigravity", color: "#8c7bd1", mark: AntigravityIcon },
} satisfies Record<UsageProviderKind, UsageProviderPresentation>;

export const PROVIDER_ORDER = Object.keys(PROVIDER_PRESENTATION) as UsageProviderKind[];

export function providersWithUsage(
  totals: readonly {
    readonly provider: UsageProviderKind;
    readonly costUsd: number;
    readonly totalTokens: number;
  }[],
): readonly UsageProviderKind[] {
  const active = new Set(
    totals
      .filter((entry) => entry.totalTokens > 0 || entry.costUsd > 0)
      .map((entry) => entry.provider),
  );
  return PROVIDER_ORDER.filter((provider) => active.has(provider));
}

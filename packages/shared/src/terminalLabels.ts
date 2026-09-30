import type { TerminalSummary } from "@t3tools/contracts";

export function getTerminalLabel(terminalId: string): string {
  const numericSuffix = /^term(?:inal)?-(\d+)$/i.exec(terminalId)?.[1];
  if (numericSuffix) {
    return `Terminal ${numericSuffix}`;
  }

  return terminalId;
}

export function resolveTerminalSessionLabel(
  terminalId: string,
  summary: Pick<TerminalSummary, "label"> | null | undefined,
): string {
  const trimmed = summary?.label?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  return getTerminalLabel(terminalId);
}

export function nextTerminalId(existingTerminalIds: ReadonlyArray<string>): string {
  const usedIds = new Set(existingTerminalIds.filter((id) => id.trim().length > 0));
  let nextIndex = 1;
  while (usedIds.has(`term-${nextIndex}`)) {
    nextIndex += 1;
  }

  return `term-${nextIndex}`;
}

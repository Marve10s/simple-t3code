import type { PullRequestCheck } from "@t3tools/contracts";

function isAtLeastAsNew(candidate: string | null, kept: string | null): boolean {
  if (candidate === null) return kept === null;
  return kept === null || candidate >= kept;
}

export function dedupeChecks(
  entries: ReadonlyArray<{
    readonly check: PullRequestCheck;
    readonly workflowName: string | null;
    readonly at: string | null;
  }>,
): ReadonlyArray<PullRequestCheck> {
  const newestByCheck = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    const key = `${entry.workflowName ?? ""} ${entry.check.name}`;
    const kept = newestByCheck.get(key);
    if (kept === undefined || isAtLeastAsNew(entry.at, kept.at)) newestByCheck.set(key, entry);
  }
  const survivors = [...newestByCheck.values()];
  const countsByName = new Map<string, number>();
  for (const entry of survivors) {
    countsByName.set(entry.check.name, (countsByName.get(entry.check.name) ?? 0) + 1);
  }
  return survivors.map((entry) => {
    const workflowName = entry.workflowName ?? "";
    return workflowName.length > 0 && (countsByName.get(entry.check.name) ?? 0) > 1
      ? { ...entry.check, name: `${workflowName} / ${entry.check.name}` }
      : entry.check;
  });
}

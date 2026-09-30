// @effect-diagnostics nodeBuiltinImport:off globalConsole:off -- Standalone maintenance script run with plain Node.
import * as NodeChildProcess from "node:child_process";

const TEST_PATH =
  /\.(test|spec|bench|test-d|test-support|testFixtures|fixture)\.[cm]?[jt]sx?$|TestHarness\.ts$|\.integration\.ts$|\.test\.py$|_tests\.rs$|(^|\/)(__tests__|testUtils|testFixtures)\/|^(apps\/server\/(integration|test)|apps\/web\/(src\/)?test|packages\/[^/]+\/test|oxlint-plugin-t3code\/test|native\/[^/]+\/tests|apps\/mobile\/modules\/[^/]+\/(tests|android\/src\/test)|packages\/shared\/src\/testing|apps\/server\/src\/vcs\/testing|apps\/mobile\/scripts\/fixtures|\.(cursor|macroscope|vscode))\//;

function git(...args: ReadonlyArray<string>): string {
  return NodeChildProcess.execFileSync("git", args, { encoding: "utf8" }).trim();
}

function lines(output: string): ReadonlyArray<string> {
  return output.split("\n").filter((line) => line.length > 0);
}

function isTestPath(path: string): boolean {
  return !path.startsWith(".repos/") && TEST_PATH.test(path);
}

const FORK_OWNED = new Set(["README.md", "CONTRIBUTING.md"]);

const ref =
  process.argv[2] ?? (lines(git("remote")).includes("upstream") ? "upstream/main" : "origin/main");
const remote = ref.includes("/") ? ref.slice(0, ref.indexOf("/")) : "origin";

git("fetch", remote);
try {
  git("merge", "--no-ff", "--no-commit", ref);
} catch {
  console.log("Merge stopped with conflicts; resolving test files.");
}

const conflicts = lines(git("status", "--porcelain", "--untracked-files=no"));
const deletedByUs = conflicts.filter((line) => line.startsWith("DU ")).map((line) => line.slice(3));
const testConflicts = lines(git("diff", "--name-only", "--diff-filter=U")).filter(isTestPath);
const addedTests = lines(git("diff", "--cached", "--name-only", "--diff-filter=A")).filter(
  isTestPath,
);
const dropped = [...new Set([...deletedByUs, ...testConflicts, ...addedTests])];
if (dropped.length > 0) git("rm", "-q", "-f", "--", ...dropped);
const forkOwned = lines(git("diff", "--name-only", "--diff-filter=U")).filter((path) =>
  FORK_OWNED.has(path),
);
if (forkOwned.length > 0) {
  git("checkout", "--ours", "--", ...forkOwned);
  git("add", "--", ...forkOwned);
}

NodeChildProcess.execFileSync("node", ["scripts/strip-comments.ts", "--write"], {
  stdio: "inherit",
});
NodeChildProcess.execFileSync("vp", ["fmt"], { stdio: "inherit" });

const remaining = lines(git("diff", "--name-only", "--diff-filter=U"));
console.log(`Kept ${dropped.length} test or fork-removed files deleted.`);
console.log(
  remaining.length === 0
    ? "No conflicts left. Review, then commit the merge."
    : `Resolve these conflicts by hand:\n${remaining.join("\n")}`,
);
console.log(
  "Also remove any test scripts, test config blocks or test-only dependencies the merge brought back.",
);

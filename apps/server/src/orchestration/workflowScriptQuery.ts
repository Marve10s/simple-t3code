// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { OrchestrationGetWorkflowScriptError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

const SCRIPT_BYTE_CAP = 256 * 1024;

function scriptsRoot(): string {
  return NodePath.join(NodeOS.homedir(), ".claude", "projects");
}

export const readWorkflowScript = Effect.fn("orchestration.readWorkflowScript")(function* (input: {
  readonly scriptPath: string;
}) {
  const requested = input.scriptPath;

  if (!NodePath.isAbsolute(requested) || NodePath.extname(requested) !== ".js") {
    return yield* new OrchestrationGetWorkflowScriptError({
      reason: "invalid-path",
      scriptPath: requested,
    });
  }

  const root = yield* Effect.tryPromise({
    try: () => NodeFSP.realpath(scriptsRoot()),
    catch: (cause) =>
      new OrchestrationGetWorkflowScriptError({
        reason: "root-unavailable",
        scriptPath: requested,
        cause,
      }),
  });

  const resolved = yield* Effect.tryPromise({
    try: () => NodeFSP.realpath(requested),
    catch: (cause) =>
      new OrchestrationGetWorkflowScriptError({
        reason: "not-found",
        scriptPath: requested,
        cause,
      }),
  });

  if (resolved !== root && !resolved.startsWith(`${root}${NodePath.sep}`)) {
    return yield* new OrchestrationGetWorkflowScriptError({
      reason: "outside-root",
      scriptPath: resolved,
    });
  }
  if (NodePath.extname(resolved) !== ".js") {
    return yield* new OrchestrationGetWorkflowScriptError({
      reason: "not-js",
      scriptPath: resolved,
    });
  }

  const read = yield* Effect.tryPromise({
    try: async () => {
      const handle = await NodeFSP.open(resolved, "r");
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) {
          return { failure: "not-regular-file" as const };
        }
        const pathStat = await NodeFSP.lstat(resolved);
        if (stat.ino !== pathStat.ino || stat.dev !== pathStat.dev) {
          return { failure: "changed-during-read" as const };
        }
        const truncated = stat.size > SCRIPT_BYTE_CAP;
        const buffer = Buffer.alloc(Math.min(stat.size, SCRIPT_BYTE_CAP));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        return {
          contents: buffer.subarray(0, bytesRead).toString("utf8"),
          truncated,
        };
      } finally {
        await handle.close();
      }
    },
    catch: (cause) =>
      new OrchestrationGetWorkflowScriptError({
        reason: "read-failed",
        scriptPath: resolved,
        cause,
      }),
  });
  if ("failure" in read) {
    return yield* new OrchestrationGetWorkflowScriptError({
      reason: read.failure,
      scriptPath: resolved,
    });
  }

  return {
    scriptPath: resolved,
    contents: read.contents,
    truncated: read.truncated,
  };
});

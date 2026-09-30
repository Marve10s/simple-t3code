// @effect-diagnostics nodeBuiltinImport:off
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type * as Path from "effect/Path";

export function expandHomePath(value: string): string {
  if (!value) return value;
  if (value === "~") return NodeOS.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return NodePath.join(NodeOS.homedir(), value.slice(2));
  }
  return value;
}

export function expandHomePathWith(value: string, path: Path.Path): string {
  if (value === "~") {
    return NodeOS.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(NodeOS.homedir(), value.slice(2));
  }
  return value;
}

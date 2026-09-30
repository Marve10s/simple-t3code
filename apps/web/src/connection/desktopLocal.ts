import type { ConnectionTarget } from "@t3tools/client-runtime/connection";
import {
  PRIMARY_LOCAL_ENVIRONMENT_ID,
  type DesktopBridge,
  type DesktopEnvironmentBootstrap,
} from "@t3tools/contracts";

const DESKTOP_LOCAL_CONNECTION_ID_PREFIX = "local:";

export function desktopLocalConnectionId(backendId: string): string {
  return `${DESKTOP_LOCAL_CONNECTION_ID_PREFIX}${backendId}`;
}

export function isDesktopLocalConnectionTarget(
  target: ConnectionTarget,
): target is Extract<ConnectionTarget, { readonly _tag: "BearerConnectionTarget" }> {
  return (
    target._tag === "BearerConnectionTarget" &&
    target.connectionId.startsWith(DESKTOP_LOCAL_CONNECTION_ID_PREFIX)
  );
}

export function desktopLocalBackendId(target: ConnectionTarget): string | null {
  return isDesktopLocalConnectionTarget(target)
    ? target.connectionId.slice(DESKTOP_LOCAL_CONNECTION_ID_PREFIX.length)
    : null;
}

export function isWslConnectionTarget(target: ConnectionTarget): boolean {
  return desktopLocalBackendId(target)?.startsWith("wsl:") === true;
}

export type DesktopSecondaryBootstrapsRead =
  | {
      readonly _tag: "Success";
      readonly bootstraps: ReadonlyArray<DesktopEnvironmentBootstrap>;
    }
  | {
      readonly _tag: "Failure";
      readonly cause: unknown;
    };

export interface DesktopSecondaryBootstrapsReader {
  readonly readResult: () => DesktopSecondaryBootstrapsRead;
  readonly readSnapshot: () => ReadonlyArray<DesktopEnvironmentBootstrap>;
}

export function createDesktopSecondaryBootstrapsReader(
  resolveBridge: () => Pick<DesktopBridge, "getLocalEnvironmentBootstraps"> | undefined,
): DesktopSecondaryBootstrapsReader {
  let snapshot: ReadonlyArray<DesktopEnvironmentBootstrap> = [];

  const readResult = (): DesktopSecondaryBootstrapsRead => {
    const bridge = resolveBridge();
    if (bridge === undefined) {
      snapshot = [];
      return { _tag: "Success", bootstraps: snapshot };
    }
    try {
      snapshot = bridge
        .getLocalEnvironmentBootstraps()
        .filter((entry) => entry.id !== PRIMARY_LOCAL_ENVIRONMENT_ID);
      return { _tag: "Success", bootstraps: snapshot };
    } catch (cause) {
      return { _tag: "Failure", cause };
    }
  };

  return {
    readResult,
    readSnapshot: () => {
      const result = readResult();
      return result._tag === "Success" ? result.bootstraps : snapshot;
    },
  };
}

const desktopSecondaryBootstrapsReader = createDesktopSecondaryBootstrapsReader(
  () => window.desktopBridge,
);

export function readDesktopSecondaryBootstrapsResult(): DesktopSecondaryBootstrapsRead {
  return desktopSecondaryBootstrapsReader.readResult();
}

export function readDesktopSecondaryBootstraps(): ReadonlyArray<DesktopEnvironmentBootstrap> {
  return desktopSecondaryBootstrapsReader.readSnapshot();
}

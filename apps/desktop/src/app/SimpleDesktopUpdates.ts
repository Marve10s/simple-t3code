import * as Effect from "effect/Effect";
import { ElectronShell } from "../electron/ElectronShell.ts";

export const manualUpdateRequired = {
  action: "done",
  outcome: "failed",
  reason:
    "SimpleT3Code updates require manual installation on the host. Open its update button to download the new release, then quit and replace the app.",
} as const;

export const make = Effect.gen(function* () {
  const shell = yield* ElectronShell;
  return Effect.fn("simple.desktop.openUpdateDownload")(function* (version: string | null) {
    if (!version) return false;
    return yield* shell.openExternal(
      `https://github.com/Marve10s/simple-t3code/releases/tag/v${encodeURIComponent(version)}`,
    );
  });
});

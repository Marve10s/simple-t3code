import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as ElectronProtocol from "../electron/ElectronProtocol.ts";
import * as DesktopAssets from "./DesktopAssets.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import { makeComponentLogger } from "./DesktopObservability.ts";

const { logInfo, logWarning } = makeComponentLogger("desktop-linux-url-handler");

export class DesktopLinuxUrlHandlerRegistrationError extends Schema.TaggedError<DesktopLinuxUrlHandlerRegistrationError>()(
  "DesktopLinuxUrlHandlerRegistrationError",
  {
    step: Schema.Literals(["write-desktop-entry", "set-default-handler"]),
    scheme: Schema.String,
    desktopEntryPath: Schema.optionalKey(Schema.String),
    exitCode: Schema.optionalKey(Schema.Number),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {
  override get message(): string {
    const exitCode = this.exitCode === undefined ? "" : `, xdg-mime exit code ${this.exitCode}`;
    return `Failed to register the ${this.scheme}:// URL handler (step: ${this.step}${exitCode}).`;
  }
}

const isRegistrationError = Schema.is(DesktopLinuxUrlHandlerRegistrationError);

export class DesktopLinuxUrlHandlerCacheRefreshError extends Schema.TaggedError<DesktopLinuxUrlHandlerCacheRefreshError>()(
  "DesktopLinuxUrlHandlerCacheRefreshError",
  {
    applicationsDir: Schema.String,
    exitCode: Schema.optionalKey(Schema.Number),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {
  override get message(): string {
    const exitCode =
      this.exitCode === undefined ? "" : `, update-desktop-database exit code ${this.exitCode}`;
    return `Failed to refresh the desktop MIME cache at ${this.applicationsDir}${exitCode}.`;
  }
}

const isCacheRefreshError = Schema.is(DesktopLinuxUrlHandlerCacheRefreshError);

const escapeDesktopEntryString = (value: string): string =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");

export function escapeDesktopEntryExecArgument(value: string): string {
  const quoted = value
    .replaceAll("\\", () => "\\\\")
    .replaceAll("`", () => "\\`")
    .replaceAll("$", () => "\\$")
    .replaceAll('"', () => '\\"')
    .replaceAll("%", () => "%%");
  return escapeDesktopEntryString(`"${quoted}"`);
}

export function renderUrlHandlerDesktopEntry(input: {
  readonly displayName: string;
  readonly execTarget: string;
  readonly scheme: string;
  readonly iconPath?: string;
}): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${escapeDesktopEntryString(input.displayName)}`,
    `Exec=${escapeDesktopEntryExecArgument(input.execTarget)} %U`,
    ...(input.iconPath === undefined ? [] : [`Icon=${escapeDesktopEntryString(input.iconPath)}`]),
    "Terminal=false",
    "NoDisplay=true",
    "StartupNotify=false",
    `MimeType=x-scheme-handler/${input.scheme};`,
    "",
  ].join("\n");
}

export class DesktopLinuxUrlHandler extends Context.Service<
  DesktopLinuxUrlHandler,
  {
    readonly register: Effect.Effect<void>;
  }
>()("@t3tools/desktop/app/DesktopLinuxUrlHandler") {}

/** @public */
export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const assets = yield* DesktopAssets.DesktopAssets;

  const scheme = ElectronProtocol.getDesktopScheme(environment.isDevelopment);
  const desktopEntryPath = environment.path.join(
    environment.linuxApplicationsDir,
    environment.linuxDesktopEntryName,
  );
  const iconsDir = environment.path.join(environment.linuxApplicationsDir, "..", "icons");
  const iconPath = environment.path.join(iconsDir, `${environment.linuxDesktopEntryName}.png`);

  const writeDesktopEntry = Effect.gen(function* () {
    const execTarget = Option.getOrElse(environment.appImagePath, () => process.execPath);
    const content = renderUrlHandlerDesktopEntry({
      displayName: environment.displayName,
      execTarget,
      scheme,
      ...(environment.isPackaged ? { iconPath } : {}),
    });
    const existing = yield* fileSystem
      .readFileString(desktopEntryPath)
      .pipe(Effect.orElseSucceed(() => null));
    if (existing === content) return;
    yield* fileSystem.makeDirectory(environment.linuxApplicationsDir, { recursive: true });
    yield* fileSystem.writeFileString(desktopEntryPath, content);
  }).pipe(
    Effect.mapError(
      (cause) =>
        new DesktopLinuxUrlHandlerRegistrationError({
          step: "write-desktop-entry",
          scheme,
          desktopEntryPath,
          cause,
        }),
    ),
  );

  const updateDesktopDatabase = Effect.scoped(
    Effect.gen(function* () {
      const command = ChildProcess.make(
        "update-desktop-database",
        [environment.linuxApplicationsDir],
        {
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
        },
      );
      const handle = yield* spawner.spawn(command);
      const exitCode = yield* handle.exitCode.pipe(Effect.timeout("5 seconds"));
      if (exitCode !== 0) {
        return yield* new DesktopLinuxUrlHandlerCacheRefreshError({
          applicationsDir: environment.linuxApplicationsDir,
          exitCode,
        });
      }
    }),
  ).pipe(
    Effect.mapError((error) =>
      isCacheRefreshError(error)
        ? error
        : new DesktopLinuxUrlHandlerCacheRefreshError({
            applicationsDir: environment.linuxApplicationsDir,
            cause: error,
          }),
    ),
  );

  const setDefaultHandler = Effect.scoped(
    Effect.gen(function* () {
      const command = ChildProcess.make(
        "xdg-mime",
        ["default", environment.linuxDesktopEntryName, `x-scheme-handler/${scheme}`],
        {
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
        },
      );
      const handle = yield* spawner.spawn(command);
      const exitCode = yield* handle.exitCode;
      if ((exitCode as unknown as number) !== 0) {
        return yield* new DesktopLinuxUrlHandlerRegistrationError({
          step: "set-default-handler",
          scheme,
          exitCode: Number(exitCode),
        });
      }
    }),
  ).pipe(
    Effect.mapError((error) =>
      isRegistrationError(error)
        ? error
        : new DesktopLinuxUrlHandlerRegistrationError({
            step: "set-default-handler",
            scheme,
            cause: error,
          }),
    ),
  );

  const register = Effect.gen(function* () {
    if (environment.platform !== "linux") {
      return;
    }
    yield* writeDesktopEntry;
    if (!environment.isPackaged) return;

    yield* Effect.gen(function* () {
      const { png } = yield* assets.iconPaths;
      if (Option.isNone(png)) return;
      yield* fileSystem.makeDirectory(iconsDir, { recursive: true });
      yield* fileSystem.copyFile(png.value, iconPath);
    }).pipe(
      Effect.catch((error) =>
        logWarning("URL handler icon copy failed", { iconPath, category: error.reason._tag }),
      ),
    );

    yield* updateDesktopDatabase.pipe(
      Effect.catch((error) =>
        logWarning("desktop MIME cache refresh failed", {
          applicationsDir: environment.linuxApplicationsDir,
          message: error.message,
          ...(error.exitCode === undefined ? {} : { exitCode: error.exitCode }),
        }),
      ),
    );

    yield* setDefaultHandler;
    yield* logInfo("registered URL scheme handler", { scheme });
  }).pipe(
    Effect.catch((error) =>
      logWarning("URL scheme handler registration failed", {
        scheme,
        step: error.step,
        message: error.message,
        ...(error.desktopEntryPath === undefined
          ? {}
          : { desktopEntryPath: error.desktopEntryPath }),
        ...(error.exitCode === undefined ? {} : { exitCode: error.exitCode }),
      }),
    ),
    Effect.withSpan("desktop.linuxUrlHandler.register"),
  );

  return DesktopLinuxUrlHandler.of({ register });
});

export const layer = Layer.effect(DesktopLinuxUrlHandler, make);

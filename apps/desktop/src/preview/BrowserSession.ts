import type { Session } from "electron";
import { session } from "electron";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as SynchronizedRef from "effect/SynchronizedRef";

const PREVIEW_PARTITION_PREFIX = "persist:t3code-preview-";
const PREVIEW_EPHEMERAL_PARTITION_PREFIX = "t3code-preview-ephemeral-";
const PROFILE_PARTITION_MARKER = "profile-";

export type BrowserSessionPartitionNamespace = "profile";

const ALLOWED_PREVIEW_PERMISSIONS: ReadonlySet<string> = new Set([
  "clipboard-read",
  "clipboard-sanitized-write",
  "notifications",
  "geolocation",
]);

export class BrowserSessionPartitionDerivationError extends Schema.TaggedError<BrowserSessionPartitionDerivationError>()(
  "BrowserSessionPartitionDerivationError",
  {
    scope: Schema.String,
    cause: Schema.instanceOf(PlatformError.PlatformError),
  },
) {
  override get message(): string {
    return `Failed to derive a desktop preview browser partition for scope ${this.scope}.`;
  }
}

export class BrowserSessionCreationError extends Schema.TaggedError<BrowserSessionCreationError>()(
  "BrowserSessionCreationError",
  {
    scope: Schema.String,
    partition: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to create a desktop preview browser session for scope ${this.scope} (partition ${this.partition}).`;
  }
}

export class BrowserSessionStorageClearError extends Schema.TaggedError<BrowserSessionStorageClearError>()(
  "BrowserSessionStorageClearError",
  {
    partition: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to clear desktop preview browser storage for partition ${this.partition}.`;
  }
}

export class BrowserSessionCacheClearError extends Schema.TaggedError<BrowserSessionCacheClearError>()(
  "BrowserSessionCacheClearError",
  {
    partition: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to clear the desktop preview browser cache for partition ${this.partition}.`;
  }
}

export const BrowserSessionGetSessionError = Schema.Union([
  BrowserSessionPartitionDerivationError,
  BrowserSessionCreationError,
]);
export type BrowserSessionGetSessionError = typeof BrowserSessionGetSessionError.Type;

export const BrowserSessionError = Schema.Union([
  BrowserSessionPartitionDerivationError,
  BrowserSessionCreationError,
  BrowserSessionStorageClearError,
  BrowserSessionCacheClearError,
]);
export type BrowserSessionError = typeof BrowserSessionError.Type;

export class BrowserSession extends Context.Service<
  BrowserSession,
  {
    readonly getPartition: (
      scope?: string,
      persistent?: boolean,
      namespace?: BrowserSessionPartitionNamespace,
    ) => Effect.Effect<string, BrowserSessionPartitionDerivationError>;
    readonly isPartition: (partition: string) => boolean;
    readonly getSession: (
      scope?: string,
      persistent?: boolean,
      namespace?: BrowserSessionPartitionNamespace,
    ) => Effect.Effect<Session, BrowserSessionGetSessionError>;
    readonly clearCookies: (
      partitions?: ReadonlyArray<string>,
    ) => Effect.Effect<void, BrowserSessionStorageClearError>;
    readonly clearCache: (
      partitions?: ReadonlyArray<string>,
    ) => Effect.Effect<void, BrowserSessionCacheClearError>;
  }
>()("@t3tools/desktop/preview/BrowserSession") {}

const selectSessions = (
  sessions: ReadonlyMap<string, Session>,
  partitions: ReadonlyArray<string> | undefined,
): ReadonlyArray<readonly [string, Session]> =>
  [...sessions.entries()].filter(
    ([partition]) => partitions === undefined || partitions.includes(partition),
  );

const encodeScopeForDigest = (scope: string): Uint8Array =>
  new TextEncoder().encode(
    scope
      .replace(/\\/g, "\\\\")
      .replace(
        /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
        (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`,
      ),
  );

/** @public */
export const make = Effect.gen(function* BrowserSessionMake() {
  const crypto = yield* Crypto.Crypto;
  const sessionsRef = yield* SynchronizedRef.make<ReadonlyMap<string, Session>>(new Map());

  const getPartition = Effect.fn("BrowserSession.getPartition")(function* (
    scope = "shared",
    persistent = true,
    namespace?: BrowserSessionPartitionNamespace,
  ) {
    const digest = yield* crypto.digest("SHA-256", encodeScopeForDigest(scope)).pipe(
      Effect.mapError(
        (cause) =>
          new BrowserSessionPartitionDerivationError({
            scope,
            cause,
          }),
      ),
    );
    const prefix = persistent ? PREVIEW_PARTITION_PREFIX : PREVIEW_EPHEMERAL_PARTITION_PREFIX;
    return `${prefix}${namespace === "profile" ? PROFILE_PARTITION_MARKER : ""}${Encoding.encodeHex(digest).slice(0, 20)}`;
  });

  const getSession = Effect.fn("BrowserSession.getSession")(function* (
    scope = "shared",
    persistent = true,
    namespace?: BrowserSessionPartitionNamespace,
  ) {
    const partition = yield* getPartition(scope, persistent, namespace);
    return yield* SynchronizedRef.modifyEffect(sessionsRef, (sessions) => {
      const existing = sessions.get(partition);
      if (existing) return Effect.succeed([existing, sessions] as const);
      return Effect.try({
        try: () => {
          const browserSession = session.fromPartition(partition);
          browserSession.setPermissionRequestHandler((_webContents, permission, callback) => {
            callback(ALLOWED_PREVIEW_PERMISSIONS.has(permission));
          });
          browserSession.setPermissionCheckHandler((_webContents, permission) =>
            ALLOWED_PREVIEW_PERMISSIONS.has(permission),
          );
          const next = new Map(sessions);
          next.set(partition, browserSession);
          return [browserSession, next] as const;
        },
        catch: (cause) =>
          new BrowserSessionCreationError({
            scope,
            partition,
            cause,
          }),
      });
    });
  });

  return BrowserSession.of({
    getPartition,
    isPartition: (partition) =>
      partition.startsWith(PREVIEW_PARTITION_PREFIX) ||
      partition.startsWith(PREVIEW_EPHEMERAL_PARTITION_PREFIX),
    getSession,
    clearCookies: Effect.fn("BrowserSession.clearCookies")(function* (partitions?) {
      const sessions = yield* SynchronizedRef.get(sessionsRef);
      yield* Effect.forEach(
        selectSessions(sessions, partitions),
        ([partition, browserSession]) =>
          Effect.tryPromise({
            try: () =>
              browserSession.clearStorageData({
                storages: ["cookies", "localstorage", "indexdb", "serviceworkers"],
              }),
            catch: (cause) =>
              new BrowserSessionStorageClearError({
                partition,
                cause,
              }),
          }),
        { concurrency: "unbounded", discard: true },
      );
    }),
    clearCache: Effect.fn("BrowserSession.clearCache")(function* (partitions?) {
      const sessions = yield* SynchronizedRef.get(sessionsRef);
      yield* Effect.forEach(
        selectSessions(sessions, partitions),
        ([partition, browserSession]) =>
          Effect.tryPromise({
            try: () => browserSession.clearCache(),
            catch: (cause) =>
              new BrowserSessionCacheClearError({
                partition,
                cause,
              }),
          }),
        { concurrency: "unbounded", discard: true },
      );
    }),
  });
}).pipe(Effect.withSpan("BrowserSession.make"));

export const layer = Layer.effect(BrowserSession, make);

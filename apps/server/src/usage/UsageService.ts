import * as NodeOS from "node:os";

import {
  ClaudeSettings,
  CodexSettings,
  type ProviderInstanceConfig,
  ProviderInstanceId,
  USAGE_CONTRACT_VERSION,
  type ServerSettings as ServerSettingsValue,
  type UsageProviderKind,
  type UsageSource,
  type UsagePricing,
  type UsageSummary,
  type UsageSummaryInput,
  UsageReadError,
} from "@t3tools/contracts";
import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { ServerConfig } from "../config.ts";
import { expandHomePath } from "../pathExpansion.ts";
import * as ServerSettings from "../serverSettings.ts";
import { resolveCodexHomeLayout } from "../provider/Drivers/CodexHomeLayout.ts";
import { resolveAntigravityInstanceDirectories } from "../provider/antigravityAuthSupport.ts";
import { mergeProviderInstanceEnvironment } from "../provider/ProviderInstanceEnvironment.ts";
import { readOpenCodeUsage } from "./opencodeUsageReader.ts";
import { readAntigravityUsage } from "./antigravityUsageReader.ts";
import { readCursorAccountUsage } from "./cursorUsageReader.ts";
import { UsageAggregator } from "./usageAggregation.ts";
import { createOverrideRateTable, parseRateTable, type RateTable } from "./usagePricing.ts";
import {
  listTranscriptFiles,
  readDirectoryVolumeId,
  readTranscriptRecords,
} from "./usageTranscriptReader.ts";
import {
  decodeScanCache,
  dedupeWithinFile,
  encodeScanCache,
  pruneScanCache,
  type ScanCache,
} from "./usageScanCache.ts";
import type { UsageRecord } from "./usageTranscripts.ts";

const LITELLM_RATES_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const RATES_TTL_MS = 24 * 60 * 60 * 1000;

const RATES_REFRESH_FLOOR_MS = 60 * 1000;

const MTIME_SLACK_MS = 36 * 60 * 60 * 1000;
const MAX_HOURLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const CACHE_RETENTION_DAYS = 90;

const decodeCodexSettings = Schema.decodeOption(CodexSettings);
const decodeClaudeSettings = Schema.decodeOption(ClaudeSettings);

const RatesCacheFile = Schema.Struct({
  fetchedAtMs: Schema.Number,
  document: Schema.Unknown,
});
const decodeRatesCache = Schema.decodeUnknownEffect(
  Schema.fromJsonString(RatesCacheFile as unknown as Schema.Codec<typeof RatesCacheFile.Type>),
);
const encodeRatesCache = Schema.encodeEffect(
  Schema.fromJsonString(RatesCacheFile as unknown as Schema.Codec<typeof RatesCacheFile.Type>),
);

const ScanCacheJson = Schema.fromJsonString(Schema.Unknown as unknown as Schema.Codec<unknown>);
const decodeScanCacheFile = Schema.decodeUnknownEffect(ScanCacheJson);
const encodeScanCacheFile = Schema.encodeEffect(ScanCacheJson);
const encodeUsageRecordKey = Schema.encodeSync(ScanCacheJson);
const CachedSource = Schema.Struct({ dir: Schema.String, volumeId: Schema.String });
const decodeCachedSources = Schema.decodeUnknownOption(
  Schema.Struct({ sources: Schema.Record(Schema.String, CachedSource) }),
);

export class UsageService extends Context.Service<
  UsageService,
  {
    readonly readSummary: (input: UsageSummaryInput) => Effect.Effect<UsageSummary, UsageReadError>;
    readonly refreshRates: Effect.Effect<UsagePricing>;
  }
>()("t3/usage/UsageService") {}

const EMPTY_PRICING: UsagePricing = {
  status: "unavailable",
  source: LITELLM_RATES_URL,
  fetchedAt: null,
  knownModels: 0,
};

export const layerTest = Layer.succeed(
  UsageService,
  UsageService.of({
    readSummary: (input) =>
      Effect.succeed({
        contractVersion: USAGE_CONTRACT_VERSION,
        readAt: "1970-01-01T00:00:00.000Z",
        timeZone: input.timeZone,
        sinceDay: input.sinceDay,
        untilDay: input.untilDay,
        buckets: [],
        sources: [],
        pricing: EMPTY_PRICING,
        scanDurationMs: 0,
      }),
    refreshRates: Effect.succeed(EMPTY_PRICING),
  }),
);

export const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const httpClient = yield* HttpClient.HttpClient;
  const hostEnvironment = yield* HostProcessEnvironment;
  const platform = yield* HostProcessPlatform;

  const fileCache: ScanCache = new Map();
  const sourceCache = new Map<string, typeof CachedSource.Type>();
  let cacheDirty = false;
  const isWithinDirectory = (filePath: string, dir: string) => {
    const relative = path.relative(dir, filePath);
    return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
  };

  const ratesCachePath = path.join(config.stateDir, "usage-model-rates.json");
  const scanCachePath = path.join(config.stateDir, "usage-scan-cache.json");
  let rates: RateTable = new Map();
  let ratesFetchedAtMs: number | null = null;
  let ratesStatus: UsagePricing["status"] = "unavailable";
  const ratesLock = yield* Semaphore.make(1);

  const pricing = (): UsagePricing => ({
    status: ratesStatus,
    source: LITELLM_RATES_URL,
    fetchedAt:
      ratesFetchedAtMs === null ? null : DateTime.formatIso(DateTime.makeUnsafe(ratesFetchedAtMs)),
    knownModels: rates.size,
  });

  const loadRates = Effect.fn("UsageService.loadRates")(function* (force: boolean) {
    const now = yield* Clock.currentTimeMillis;
    const maxAgeMs = force ? RATES_REFRESH_FLOOR_MS : RATES_TTL_MS;
    if (ratesFetchedAtMs !== null && now - ratesFetchedAtMs < maxAgeMs) return;

    if (ratesFetchedAtMs === null) {
      const fromDisk = yield* fileSystem.readFileString(ratesCachePath).pipe(
        Effect.flatMap((raw) => decodeRatesCache(raw)),
        Effect.catchCause(() => Effect.succeed(null)),
      );
      if (fromDisk !== null) {
        const parsed = parseRateTable(fromDisk.document);
        if (parsed.size > 0) {
          rates = parsed;
          ratesFetchedAtMs = fromDisk.fetchedAtMs;
          ratesStatus = "cached";
          if (now - fromDisk.fetchedAtMs < maxAgeMs) return;
        }
      }
    }

    const fetched = yield* httpClient.get(LITELLM_RATES_URL).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((response) => response.json),
      Effect.timeout(10_000),
      Effect.catchCause(() => Effect.succeed(null)),
    );
    if (fetched === null) {
      if (rates.size > 0) ratesStatus = "cached";
      return;
    }

    const parsed = parseRateTable(fetched);
    if (parsed.size === 0) return;

    rates = parsed;
    ratesFetchedAtMs = now;
    ratesStatus = "fresh";

    yield* encodeRatesCache({ fetchedAtMs: now, document: fetched }).pipe(
      Effect.flatMap((serialized) => fileSystem.writeFileString(ratesCachePath, serialized)),
      Effect.ignoreCause,
    );
  });

  const ensureRates = (force: boolean) => ratesLock.withPermit(loadRates(force));

  const refreshRates = ensureRates(true).pipe(
    Effect.map(pricing),
    Effect.withSpan("UsageService.refreshRates"),
  );

  const readSettings = settingsService.getSettings.pipe(
    Effect.catchCause(
      (cause) =>
        new UsageReadError({
          reason: "scanFailed",
          detail: "Server settings could not be read.",
          cause: Cause.squash(cause),
        }),
    ),
  );

  const resolveTranscriptDirs = Effect.fn("UsageService.resolveTranscriptDirs")(function* (
    settings: ServerSettingsValue,
    retentionCutoffMs: number,
  ) {
    const dirs: Array<{
      provider: UsageProviderKind;
      dir: string;
      volumeId: string;
      fileName?: string;
    }> = [];
    const seen = new Set<string>();
    for (const driver of ["claudeAgent", "codex", "grok"] as const) {
      const instances: Array<
        Pick<ProviderInstanceConfig, "config" | "environment"> & { instanceId: ProviderInstanceId }
      > = Object.entries(settings.providerInstances)
        .filter(([, instance]) => instance.driver === driver)
        .map(([id, instance]) => ({ ...instance, instanceId: ProviderInstanceId.make(id) }));
      if (!Object.hasOwn(settings.providerInstances, driver)) {
        instances.push({
          config: settings.providers[driver],
          instanceId: ProviderInstanceId.make(driver),
        });
      }
      for (const instance of instances) {
        const environment = mergeProviderInstanceEnvironment(instance.environment, hostEnvironment);
        const provider = driver === "claudeAgent" ? "claude" : driver;
        let home: string;
        if (driver === "codex") {
          const decoded = decodeCodexSettings(instance.config ?? {});
          if (Option.isNone(decoded)) continue;
          const codexConfig = decoded.value;
          const environmentHome = environment.CODEX_HOME?.trim();
          const layout = yield* resolveCodexHomeLayout(
            codexConfig.setupMode !== "managed" &&
              !codexConfig.homePath.trim() &&
              !codexConfig.shadowHomePath.trim() &&
              environmentHome
              ? { ...codexConfig, homePath: environmentHome }
              : codexConfig,
          );
          home = layout.sharedHomePath;
        } else if (driver === "claudeAgent") {
          const decoded = decodeClaudeSettings(instance.config ?? {});
          if (Option.isNone(decoded)) continue;
          const configured = decoded.value.homePath.trim();
          home = configured
            ? expandHomePath(configured)
            : environment.CLAUDE_CONFIG_DIR?.trim() || path.join(NodeOS.homedir(), ".claude");
        } else {
          home = expandHomePath(
            environment.GROK_HOME?.trim() || path.join(NodeOS.homedir(), ".grok"),
          );
        }
        const directory = path.resolve(home, provider === "claude" ? "projects" : "sessions");
        const sourceKey = provider + "\0" + directory;
        const previous = sourceCache.get(sourceKey);
        const dir = yield* fileSystem
          .realPath(directory)
          .pipe(Effect.orElseSucceed(() => previous?.dir ?? directory));
        const currentVolumeId = yield* Effect.promise(() => readDirectoryVolumeId(dir));
        const hasRetainedHistory = fileCache
          .entries()
          .some(
            ([filePath, entry]) =>
              entry.provider === provider &&
              entry.mtimeMs >= retentionCutoffMs &&
              entry.records.length + entry.tailRecords.length > 0 &&
              isWithinDirectory(filePath, dir),
          );
        const volumeId =
          previous?.dir === dir && (hasRetainedHistory || !currentVolumeId)
            ? previous.volumeId || currentVolumeId
            : currentVolumeId;
        if (previous?.dir !== dir || previous.volumeId !== volumeId) {
          sourceCache.set(sourceKey, { dir, volumeId });
          cacheDirty = true;
        }
        const key = `${provider}\0${dir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dirs.push({
          provider,
          dir,
          volumeId,
          ...(provider === "grok" ? { fileName: "updates.jsonl" } : {}),
        });
      }
    }
    return dirs;
  });

  const ensureScanCacheLoaded = yield* Effect.cached(
    Effect.gen(function* () {
      const document = yield* fileSystem.readFileString(scanCachePath).pipe(
        Effect.flatMap((raw) => decodeScanCacheFile(raw)),
        Effect.catchCause(() => Effect.succeed(null)),
      );
      if (document === null) return;
      for (const [path, entry] of decodeScanCache(document)) fileCache.set(path, entry);
      const sources = decodeCachedSources(document);
      if (Option.isSome(sources)) {
        for (const [key, source] of Object.entries(sources.value.sources))
          sourceCache.set(key, source);
      }
    }),
  );

  const persistScanCache = Effect.fn("UsageService.persistScanCache")(function* () {
    if (!cacheDirty) return;
    yield* encodeScanCacheFile({
      ...encodeScanCache(fileCache),
      sources: Object.fromEntries(sourceCache),
    }).pipe(
      Effect.flatMap((serialized) => fileSystem.writeFileString(scanCachePath, serialized)),
      Effect.map(() => {
        cacheDirty = false;
      }),
      Effect.ignoreCause,
    );
  });

  const readFileRecords = (
    filePath: string,
    size: number,
    mtimeMs: number,
    provider: UsageProviderKind,
  ): Effect.Effect<readonly UsageRecord[]> =>
    Effect.gen(function* () {
      const cached = fileCache.get(filePath);
      if (
        cached &&
        cached.size === size &&
        cached.mtimeMs === mtimeMs &&
        cached.provider === provider
      ) {
        return cached.tailRecords.length === 0
          ? cached.records
          : [...cached.records, ...cached.tailRecords];
      }

      const resumeFrom =
        cached !== undefined && cached.provider === provider && size > cached.size
          ? cached.position
          : undefined;

      const parsed = yield* Effect.promise(() =>
        readTranscriptRecords(filePath, provider, resumeFrom),
      );
      if (parsed === null)
        return cached?.provider === provider ? [...cached.records, ...cached.tailRecords] : [];

      const base = parsed.resumed && cached !== undefined ? cached.records : [];
      const seen = new Set<string>();
      const records = dedupeWithinFile([...base, ...parsed.records], seen);
      const tailRecords = dedupeWithinFile(parsed.tailRecords, seen);

      fileCache.set(filePath, {
        size,
        mtimeMs,
        provider,
        records,
        tailRecords,
        position: parsed.position,
      });
      cacheDirty = true;
      return tailRecords.length === 0 ? records : [...records, ...tailRecords];
    });

  interface ScannedDir {
    readonly provider: UsageProviderKind;
    readonly dir: string;
    readonly volumeId: string;
    readonly hostId?: string;
    readonly status?: UsageSource["status"];
    readonly message?: string;
    readonly action?: UsageSource["action"];
    readonly files:
      | readonly { readonly path: string; readonly records: readonly UsageRecord[] }[]
      | null;
  }

  const collectDirs = Effect.fn("UsageService.collectDirs")(function* (
    windowStartMs: number,
    settings: ServerSettingsValue,
    retentionCutoffMs: number,
  ) {
    const dirs = yield* resolveTranscriptDirs(settings, retentionCutoffMs).pipe(
      Effect.provideService(Path.Path, path),
    );
    const scanned: ScannedDir[] = [];
    for (const { provider, dir, volumeId, fileName } of dirs) {
      const exists = yield* fileSystem
        .exists(dir)
        .pipe(Effect.catchCause(() => Effect.succeed(false)));
      if (!exists) {
        scanned.push({ provider, dir, volumeId, files: null });
        continue;
      }
      const files = yield* Effect.promise(() =>
        listTranscriptFiles(dir, windowStartMs, fileName === undefined ? undefined : { fileName }),
      );
      const parsedFiles: { path: string; records: readonly UsageRecord[] }[] = [];
      for (const file of files) {
        const records = yield* readFileRecords(file.path, file.size, file.mtimeMs, provider);
        parsedFiles.push({ path: file.path, records });
      }
      scanned.push({ provider, dir, volumeId, files: parsedFiles });
    }

    const home = NodeOS.homedir();
    const envRoots = Effect.fnUntraced(function* (key: string, defaults: readonly string[]) {
      const roots = hostEnvironment[key]
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const canonical = new Set<string>();
      for (const root of roots?.length ? roots : defaults) {
        const resolved = path.resolve(expandHomePath(root));
        canonical.add(
          yield* fileSystem.realPath(resolved).pipe(Effect.orElseSucceed(() => resolved)),
        );
      }
      return [...canonical];
    });
    const dataHome = hostEnvironment["XDG_DATA_HOME"]?.trim();
    for (const dir of yield* envRoots("OPENCODE_DATA_DIR", [
      path.join(
        dataHome && path.isAbsolute(dataHome) ? dataHome : path.join(home, ".local", "share"),
        "opencode",
      ),
    ])) {
      const result = yield* Effect.promise(() => readOpenCodeUsage(dir, windowStartMs));
      scanned.push({
        provider: "opencode",
        dir,
        volumeId: yield* Effect.promise(() => readDirectoryVolumeId(dir)),
        files: result.missing && !result.error ? null : result.files,
        status: result.error ? "partial" : "ok",
        ...(result.error ? { message: "Some OpenCode history could not be read." } : {}),
      });
    }
    const antigravityRoots = yield* envRoots("ANTIGRAVITY_DATA_DIR", [
      ...["antigravity", "antigravity-cli", "antigravity-ide", "antigravity-backup"].map((name) =>
        path.join(home, ".gemini", name),
      ),
      path.join(home, ".config", "antigravity"),
    ]);
    for (const [instanceId, instance] of Object.entries(settings.providerInstances)) {
      if (instance.driver === "antigravity") {
        const directories = yield* resolveAntigravityInstanceDirectories(
          config.stateDir,
          ProviderInstanceId.make(instanceId),
        ).pipe(
          Effect.provideService(Crypto.Crypto, crypto),
          Effect.provideService(Path.Path, path),
          Effect.mapError(
            (cause) =>
              new UsageReadError({
                reason: "scanFailed",
                detail: "Antigravity profile directory could not be resolved.",
                cause,
              }),
          ),
        );
        antigravityRoots.push(path.join(directories.profile, "antigravity-acp"));
      }
    }
    const antigravityDirs = new Set<string>();
    for (const root of antigravityRoots) {
      const resolvedRoot = yield* fileSystem.realPath(root).pipe(Effect.orElseSucceed(() => root));
      const nested = path.join(resolvedRoot, "conversations");
      const dir = (yield* fileSystem
        .exists(nested)
        .pipe(Effect.catchCause(() => Effect.succeed(false))))
        ? nested
        : resolvedRoot;
      antigravityDirs.add(yield* fileSystem.realPath(dir).pipe(Effect.orElseSucceed(() => dir)));
    }
    const antigravity = yield* Effect.promise(() =>
      readAntigravityUsage([...antigravityDirs], windowStartMs),
    );
    for (const dir of antigravityDirs) {
      const exists = yield* fileSystem
        .exists(dir)
        .pipe(Effect.catchCause(() => Effect.succeed(false)));
      const failed = antigravity.errors.some(
        (error) => error === dir || error.startsWith(`${dir}${path.sep}`),
      );
      scanned.push({
        provider: "antigravity",
        dir,
        volumeId: yield* Effect.promise(() => readDirectoryVolumeId(dir)),
        files: !exists && !failed ? null : antigravity.files.filter((file) => file.root === dir),
        status: failed ? "partial" : "ok",
        ...(failed ? { message: "Some Antigravity history could not be read." } : {}),
      });
    }
    const cursorUserHome =
      (platform === "win32" ? hostEnvironment["USERPROFILE"] : hostEnvironment["HOME"]) || home;
    const configHome = hostEnvironment["XDG_CONFIG_HOME"]?.trim();
    const cursorHome =
      platform === "darwin"
        ? path.join(cursorUserHome, "Library", "Application Support")
        : platform === "win32"
          ? hostEnvironment["APPDATA"] || path.join(cursorUserHome, "AppData", "Roaming")
          : configHome && path.isAbsolute(configHome)
            ? configHome
            : path.join(cursorUserHome, ".config");
    const cursorAuthPath =
      platform === "darwin"
        ? path.join(cursorUserHome, ".cursor", "auth.json")
        : path.join(cursorHome, platform === "win32" ? "Cursor" : "cursor", "auth.json");
    const credentialStore = hostEnvironment["AGENT_CLI_CREDENTIAL_STORE"];
    const loginUnavailable =
      Boolean(hostEnvironment["CURSOR_AUTH_TOKEN"]?.trim()) ||
      Boolean(hostEnvironment["CURSOR_API_KEY"]?.trim()) ||
      credentialStore === "memory";
    if (
      platform === "darwin" &&
      credentialStore !== "file" &&
      !loginUnavailable &&
      !settings.cursorKeychainUsageEnabled
    ) {
      scanned.push({
        provider: "cursor",
        dir: cursorAuthPath,
        volumeId: "",
        files: null,
        message: "Cursor account usage is off on this environment.",
        action: "enableCursorKeychain",
      });
      return scanned;
    }
    const cursorUntilMs = yield* Clock.currentTimeMillis;
    const account = loginUnavailable
      ? {
          accountKey: null,
          records: [],
          missing: true,
          error: "Cursor account history needs a Cursor CLI login on this server.",
        }
      : yield* Effect.promise(() =>
          readCursorAccountUsage(
            platform === "darwin" && credentialStore !== "file"
              ? { kind: "keychain" }
              : cursorAuthPath,
            windowStartMs,
            cursorUntilMs,
          ),
        );
    if (account.missing && account.error === null) return scanned;
    if (account.accountKey !== null && account.error === null && !account.missing) {
      const source = `cursor-account:${account.accountKey}`;
      scanned.push({
        provider: "cursor",
        dir: source,
        hostId: "cursor.com",
        volumeId: account.accountKey,
        files: [{ path: source, records: account.records }],
        status: "ok",
      });
      return scanned;
    }
    scanned.push({
      provider: "cursor",
      dir: cursorAuthPath,
      volumeId: yield* Effect.promise(() => readDirectoryVolumeId(cursorAuthPath)),
      files: null,
      message:
        account.error ?? "Cursor account history needs a Cursor CLI login saved on this server.",
    });
    return scanned;
  });

  const scanSummary = Effect.fn("UsageService.scanSummary")(function* (
    input: UsageSummaryInput,
    settings: ServerSettingsValue,
  ) {
    if (input.sinceDay > input.untilDay) {
      return yield* new UsageReadError({
        reason: "invalidWindow",
        detail: `sinceDay '${input.sinceDay}' is after untilDay '${input.untilDay}'`,
      });
    }

    let hourlyWindow: { readonly sinceTimeMs: number; readonly untilTimeMs: number } | null = null;
    if (input.resolution === "hour") {
      const sinceTime =
        input.sinceTime === undefined ? Option.none() : DateTime.make(input.sinceTime);
      const untilTime =
        input.untilTime === undefined ? Option.none() : DateTime.make(input.untilTime);
      if (Option.isNone(sinceTime) || Option.isNone(untilTime)) {
        return yield* new UsageReadError({
          reason: "invalidWindow",
          detail: "Hourly usage requires valid sinceTime and untilTime instants",
        });
      }
      const sinceTimeMs = DateTime.toEpochMillis(sinceTime.value);
      const untilTimeMs = DateTime.toEpochMillis(untilTime.value);
      const durationMs = untilTimeMs - sinceTimeMs;
      if (durationMs <= 0 || durationMs > MAX_HOURLY_WINDOW_MS) {
        return yield* new UsageReadError({
          reason: "invalidWindow",
          detail: "Hourly usage window must be greater than zero and at most 24 hours",
        });
      }
      hourlyWindow = { sinceTimeMs, untilTimeMs };
    }

    const startedAtMs = yield* Clock.currentTimeMillis;
    yield* ensureScanCacheLoaded;

    const hostId = NodeOS.hostname();
    const windowStart = DateTime.make(`${input.sinceDay}T00:00:00Z`);
    if (Option.isNone(windowStart)) {
      return yield* new UsageReadError({
        reason: "invalidWindow",
        detail: `sinceDay '${input.sinceDay}' is not a valid date`,
      });
    }
    const windowStartMs =
      (hourlyWindow?.sinceTimeMs ?? DateTime.toEpochMillis(windowStart.value)) - MTIME_SLACK_MS;

    const retentionCutoffMs = startedAtMs - CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const [, scannedDirs] = yield* Effect.all(
      [ensureRates(false), collectDirs(windowStartMs, settings, retentionCutoffMs)],
      { concurrency: 2 },
    );

    const aggregator = new UsageAggregator({
      timeZone: input.timeZone,
      sinceDay: input.sinceDay,
      untilDay: input.untilDay,
      resolution: input.resolution ?? "day",
      ...hourlyWindow,
      rates,
      priceOverrides: createOverrideRateTable(settings.usagePriceOverrides),
    });

    const sources: UsageSource[] = [];

    for (const {
      provider,
      dir,
      volumeId,
      files,
      status,
      message,
      action,
      hostId: sourceHostId,
    } of scannedDirs) {
      const retainedFiles = [...(files ?? [])];
      const livePaths = new Set(retainedFiles.map((file) => file.path));
      for (const [filePath, entry] of fileCache) {
        if (
          entry.provider !== provider ||
          entry.mtimeMs < retentionCutoffMs ||
          livePaths.has(filePath) ||
          !isWithinDirectory(filePath, dir)
        )
          continue;
        retainedFiles.push({ path: filePath, records: [...entry.records, ...entry.tailRecords] });
      }
      let scannedFiles = 0;
      let skippedFiles = 0;
      const sessionIds = new Set<string>();

      for (const file of retainedFiles) {
        if (file.records.length === 0) {
          skippedFiles += 1;
          continue;
        }
        scannedFiles += 1;
        const codexEventOccurrences = new Map<string, number>();
        for (const record of file.records) {
          let usageRecord = record;
          if (record.provider === "codex" && record.sessionId.length > 0) {
            const key = encodeUsageRecordKey([
              record.provider,
              record.sessionId,
              record.timestampMs,
              record.model,
              record.totals,
            ]);
            const occurrence = (codexEventOccurrences.get(key) ?? 0) + 1;
            codexEventOccurrences.set(key, occurrence);
            usageRecord = { ...record, dedupeKey: key + ":" + occurrence };
          }
          if (aggregator.add(usageRecord, dir) && record.sessionId.length > 0) {
            sessionIds.add(record.sessionId);
          }
        }
      }

      sources.push({
        fingerprint: { hostId: sourceHostId ?? hostId, provider, resolvedHomePath: dir, volumeId },
        status: files === null && scannedFiles === 0 ? "missing" : (status ?? "ok"),
        scannedFiles,
        skippedFiles,
        malformedRecords: 0,
        distinctSessions: sessionIds.size,
        message:
          message ?? (files === null ? "No transcript directory on this environment." : null),
        ...(action ? { action } : {}),
      });
    }

    const pruned = pruneScanCache(fileCache, retentionCutoffMs);
    if (pruned > 0) cacheDirty = true;
    yield* persistScanCache();

    const aggregated = aggregator.finish();
    const readAt = yield* DateTime.now;
    const finishedAtMs = yield* Clock.currentTimeMillis;

    return {
      contractVersion: USAGE_CONTRACT_VERSION,
      readAt: DateTime.formatIso(readAt),
      timeZone: input.timeZone,
      sinceDay: input.sinceDay,
      untilDay: input.untilDay,
      buckets: aggregated.buckets,
      sources,
      pricing: pricing(),
      scanDurationMs: Math.max(0, finishedAtMs - startedAtMs),
    } satisfies UsageSummary;
  });

  const inflightScans = new Map<string, Deferred.Deferred<UsageSummary, UsageReadError>>();

  const scanKey = (
    input: UsageSummaryInput,
    priceOverrides: ServerSettingsValue["usagePriceOverrides"],
    cursorKeychainUsageEnabled: boolean,
  ): string =>
    JSON.stringify([
      input.timeZone,
      input.sinceDay,
      input.untilDay,
      input.resolution ?? "day",
      input.sinceTime ?? null,
      input.untilTime ?? null,
      priceOverrides,
      cursorKeychainUsageEnabled,
    ]);

  const readSummary = Effect.fn("UsageService.readSummary")(function* (input: UsageSummaryInput) {
    const settings = yield* readSettings;
    const key = scanKey(input, settings.usagePriceOverrides, settings.cursorKeychainUsageEnabled);
    const deferred = yield* Effect.uninterruptible(
      Effect.gen(function* () {
        const existing = inflightScans.get(key);
        if (existing !== undefined) return existing;

        const created = Deferred.makeUnsafe<UsageSummary, UsageReadError>();
        inflightScans.set(key, created);
        yield* scanSummary(input, settings).pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => inflightScans.delete(key)).pipe(
              Effect.andThen(Deferred.done(created, exit)),
            ),
          ),
          Effect.forkDetach,
        );
        return created;
      }),
    );
    return yield* Deferred.await(deferred);
  });

  return { readSummary, refreshRates } as const;
});

export const layer = Layer.effect(UsageService, make);

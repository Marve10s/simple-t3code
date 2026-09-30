import {
  ModelCapabilities,
  TrimmedNonEmptyString,
  type ProviderDriverKind,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { codexModelFamily } from "@t3tools/shared/model";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { ServerConfig } from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import { hasValidClaudeManifestAdapters } from "./ClaudeModelManifest.ts";
import bundledManifestJson from "./model-manifest.json" with { type: "json" };
import { ProviderCompatibilityPolicy } from "./providerCompatibility.ts";
import type { ServerProviderDraft } from "./providerSnapshot.ts";

const MODEL_MANIFEST_URL =
  "https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/server/src/provider/model-manifest.json";

const MANIFEST_TTL_MS = 60 * 60 * 1000;

const MANIFEST_RETRY_MS = 5 * 60 * 1000;

const FETCH_TIMEOUT_MS = 10_000;

const ManifestModelStatus = Schema.Literals(["current", "legacy"]);

const ManifestModelProfile = Schema.Struct({
  capabilities: Schema.optional(ModelCapabilities),
  adapter: Schema.optional(Schema.Unknown),
});

const ManifestProviderModel = Schema.Struct({
  slug: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  shortName: Schema.optional(TrimmedNonEmptyString),
  subProvider: Schema.optional(TrimmedNonEmptyString),
  aliases: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  status: ManifestModelStatus,
  badge: Schema.optional(Schema.Literal("new")),
  profile: Schema.optional(TrimmedNonEmptyString),
  adapter: Schema.optional(Schema.Unknown),
});

const ManifestProviderCatalog = Schema.Struct({
  defaults: Schema.optional(
    Schema.Struct({
      chat: Schema.optional(TrimmedNonEmptyString),
    }),
  ),
  profiles: Schema.Record(Schema.String, ManifestModelProfile),
  models: Schema.Array(ManifestProviderModel),
});

const ModelManifestEnvelopeSchema = Schema.Struct({
  version: Schema.Literal(1),
  updatedAt: Schema.optional(Schema.String),
  compatibility: Schema.optional(Schema.Array(ProviderCompatibilityPolicy)),
  currentModels: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  providers: Schema.optional(Schema.Record(Schema.String, ManifestProviderCatalog)),
});

const hasValidProviderCatalogReferences = (
  manifest: typeof ModelManifestEnvelopeSchema.Type,
): boolean =>
  Object.values(manifest.providers ?? {}).every((catalog) => {
    const slugs = new Set<string>();
    const modelsAreValid = catalog.models.every((model) => {
      if (slugs.has(model.slug)) return false;
      slugs.add(model.slug);
      return model.profile === undefined || catalog.profiles[model.profile] !== undefined;
    });
    return (
      modelsAreValid && (catalog.defaults?.chat === undefined || slugs.has(catalog.defaults.chat))
    );
  });

const ModelManifestSchema = ModelManifestEnvelopeSchema.pipe(
  Schema.check(
    Schema.makeFilter(hasValidProviderCatalogReferences, {
      expected: "unique model slugs and existing model and profile references",
    }),
    Schema.makeFilter(hasValidClaudeManifestAdapters, {
      expected: "valid Claude adapter metadata",
    }),
  ),
);
export type ModelManifestData = typeof ModelManifestSchema.Type;

export interface ResolvedManifestModel {
  readonly model: ServerProviderModel;
  readonly adapter: unknown;
  readonly profileAdapter: unknown;
}

export interface ResolvedProviderCatalog {
  readonly models: ReadonlyArray<ResolvedManifestModel>;
  readonly defaults: {
    readonly chat: string | undefined;
  };
}

const decodeManifest = Schema.decodeUnknownEffect(ModelManifestSchema);

export const BUNDLED_MODEL_MANIFEST: ModelManifestData =
  Schema.decodeUnknownSync(ModelManifestSchema)(bundledManifestJson);

function manifestUpdatedAtMs(manifest: ModelManifestData): number {
  if (manifest.updatedAt === undefined) return 0;
  const parsed = Date.parse(manifest.updatedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function resolveProviderCatalog(
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
): ResolvedProviderCatalog | null {
  const catalog = manifest.providers?.[driverKind];
  if (!catalog) return null;

  const seen = new Set<string>();
  const models: Array<ResolvedManifestModel> = [];
  for (const entry of catalog.models) {
    if (seen.has(entry.slug)) return null;
    seen.add(entry.slug);

    const profile = entry.profile ? catalog.profiles[entry.profile] : undefined;
    if (entry.profile && !profile) return null;

    models.push({
      model: {
        slug: entry.slug,
        name: entry.name,
        ...(entry.shortName ? { shortName: entry.shortName } : {}),
        ...(entry.subProvider ? { subProvider: entry.subProvider } : {}),
        ...(entry.aliases ? { aliases: entry.aliases } : {}),
        ...(entry.badge ? { badge: entry.badge } : {}),
        isCustom: false,
        ...(catalog.defaults?.chat === entry.slug ? { isDefault: true } : {}),
        ...(entry.status === "legacy" ? { isLegacy: true } : {}),
        capabilities: profile?.capabilities ?? null,
      },
      adapter: entry.adapter,
      profileAdapter: profile?.adapter,
    });
  }

  if (catalog.defaults?.chat !== undefined && !seen.has(catalog.defaults.chat)) return null;

  return {
    models,
    defaults: {
      chat: catalog.defaults?.chat,
    },
  };
}

const ManifestCacheFile = Schema.Struct({
  fetchedAtMs: Schema.Number,
  manifest: ModelManifestSchema,
});
const decodeManifestCache = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    ManifestCacheFile as unknown as Schema.Codec<typeof ManifestCacheFile.Type>,
  ),
);
export const encodeManifestCache = Schema.encodeEffect(
  Schema.fromJsonString(
    ManifestCacheFile as unknown as Schema.Codec<typeof ManifestCacheFile.Type>,
  ),
);

function isLegacyModel(
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
  slug: string,
): boolean {
  const family = driverKind === "codex" ? codexModelFamily(slug) : slug;
  const catalog = manifest.providers?.[driverKind]?.models;
  const catalogModel =
    catalog?.find((model) => model.slug === slug) ??
    catalog?.find((model) => model.slug === family);
  if (catalogModel) return catalogModel.status === "legacy";
  const currentModels = manifest.currentModels[driverKind];
  if (!currentModels) return false;
  return !currentModels.includes(slug) && !currentModels.includes(family);
}

export function applyModelManifest(
  draft: ServerProviderDraft,
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
): ServerProviderDraft {
  return {
    ...draft,
    models: applyManifestDefault(
      classifyModels(draft.models, manifest, driverKind),
      manifest,
      driverKind,
    ),
  };
}

export function manifestDefaultModel(
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
): string | undefined {
  return manifest.providers?.[driverKind]?.defaults?.chat;
}

export function applyManifestDefault(
  models: ReadonlyArray<ServerProviderModel>,
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
): ReadonlyArray<ServerProviderModel> {
  const requestedSlug = manifestDefaultModel(manifest, driverKind);
  if (requestedSlug === undefined) return models;
  const slug =
    models.find((model) => model.slug === requestedSlug)?.slug ??
    (driverKind === "codex"
      ? models.find(
          (model) =>
            !model.isCustom && codexModelFamily(model.slug) === codexModelFamily(requestedSlug),
        )?.slug
      : undefined);
  if (slug === undefined) return models;
  const previous = models.find((model) => model.isDefault && model.slug !== slug);
  if (!previous) return models;
  const movedAliases = previous.aliases ?? [];
  return models.map((model) => {
    if (model.slug === previous.slug) {
      const { isDefault: _isDefault, aliases: _aliases, ...rest } = model;
      return rest;
    }
    if (model.slug === slug) {
      const aliases = [...new Set([...(model.aliases ?? []), ...movedAliases])];
      return { ...model, isDefault: true, ...(aliases.length > 0 ? { aliases } : {}) };
    }
    return model;
  });
}

export function classifyModels(
  models: ReadonlyArray<ServerProviderModel>,
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
): ReadonlyArray<ServerProviderModel> {
  return models.map((model) => {
    if (model.isCustom) return model;
    if (isLegacyModel(manifest, driverKind, model.slug)) {
      return model.isLegacy ? model : { ...model, isLegacy: true };
    }
    if (!model.isLegacy) return model;
    const { isLegacy: _isLegacy, ...rest } = model;
    return rest;
  });
}

export class ModelManifest extends Context.Service<
  ModelManifest,
  {
    readonly current: Effect.Effect<ModelManifestData>;
    readonly refresh: Effect.Effect<ModelManifestData>;
    readonly forceRefresh: Effect.Effect<ModelManifestData>;
    readonly refreshInBackground: Effect.Effect<void>;
  }
>()("t3/provider/ModelManifest") {}

const BundledOnlyModelManifest: ModelManifest["Service"] = {
  current: Effect.succeed(BUNDLED_MODEL_MANIFEST),
  refresh: Effect.succeed(BUNDLED_MODEL_MANIFEST),
  forceRefresh: Effect.succeed(BUNDLED_MODEL_MANIFEST),
  refreshInBackground: Effect.void,
};

export const layerTest = Layer.succeed(ModelManifest, BundledOnlyModelManifest);

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const httpClient = yield* HttpClient.HttpClient;
  const serviceScope = yield* Effect.scope;

  const cachePath = path.join(config.stateDir, "model-manifest.json");
  let manifest = BUNDLED_MODEL_MANIFEST;
  let fetchedAtMs: number | null = null;
  let lastAttemptMs: number | null = null;
  const refreshSemaphore = yield* Semaphore.make(1);

  const ensureDiskCacheLoaded = yield* Effect.cached(
    Effect.gen(function* () {
      const fromDisk = yield* fileSystem.readFileString(cachePath).pipe(
        Effect.flatMap((raw) => decodeManifestCache(raw)),
        Effect.catchCause(() => Effect.succeed(null)),
      );
      if (fromDisk === null) return;
      if (manifestUpdatedAtMs(BUNDLED_MODEL_MANIFEST) > manifestUpdatedAtMs(fromDisk.manifest)) {
        return;
      }
      manifest = fromDisk.manifest;
      fetchedAtMs = fromDisk.fetchedAtMs;
    }),
  );

  const refresh = Effect.fn("ModelManifest.refresh")(function* (force = false) {
    yield* ensureDiskCacheLoaded;
    const now = yield* Clock.currentTimeMillis;
    const isWithin = (sinceMs: number | null, windowMs: number) =>
      sinceMs !== null && now >= sinceMs && now - sinceMs < windowMs;
    if (!force && isWithin(fetchedAtMs, MANIFEST_TTL_MS)) return manifest;
    if (!force && isWithin(lastAttemptMs, MANIFEST_RETRY_MS)) return manifest;

    const settings = yield* settingsService.getSettings.pipe(
      Effect.catchCause(() => Effect.succeed(null)),
    );
    if (settings !== null && !settings.enableProviderUpdateChecks) return manifest;

    lastAttemptMs = now;
    const fetched = yield* httpClient.get(MODEL_MANIFEST_URL).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((response) => response.json),
      Effect.flatMap((json) => decodeManifest(json)),
      Effect.timeout(FETCH_TIMEOUT_MS),
      Effect.catchCause(() => Effect.succeed(null)),
    );
    if (fetched === null || manifestUpdatedAtMs(fetched) < manifestUpdatedAtMs(manifest)) {
      return manifest;
    }

    manifest = fetched;
    fetchedAtMs = now;
    yield* encodeManifestCache({ fetchedAtMs: now, manifest: fetched }).pipe(
      Effect.flatMap((serialized) => fileSystem.writeFileString(cachePath, serialized)),
      Effect.ignoreCause,
    );
    return manifest;
  });

  const guardedRefresh = refreshSemaphore.withPermits(1)(refresh());

  return ModelManifest.of({
    current: ensureDiskCacheLoaded.pipe(Effect.map(() => manifest)),
    refresh: guardedRefresh,
    forceRefresh: refreshSemaphore.withPermits(1)(refresh(true)),
    refreshInBackground: Effect.forkIn(guardedRefresh, serviceScope).pipe(Effect.asVoid),
  });
});

export const layer = Layer.effect(ModelManifest, make);

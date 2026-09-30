import type {
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderOptionDescriptor,
  ProviderOptionSelection,
  ScopedThreadRef,
  ServerProviderModel,
} from "@t3tools/contracts";
import {
  applyClaudePromptEffortPrefix,
  buildProviderOptionSelectionsFromDescriptors,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
  isClaudeUltrathinkPrompt,
} from "@t3tools/shared/model";
import { useMemo } from "react";

import { type DraftId, useComposerDraftStore } from "../../../composerDraftStore";
import { useClientSettings, useUpdateClientSettings } from "../../../hooks/useSettings";
import { providerModelKey } from "../../../modelOrdering";
import { getProviderModelCapabilities } from "../../../providerModels";
import {
  isProviderInstancePickerReady,
  type ProviderInstanceEntry,
} from "../../../providerInstances";
import type { ModelEsque } from "../../chat/providerIconUtils";

/** What the composer already passes to the upstream effort picker. */
export interface CodexPickerTraits {
  readonly provider: ProviderDriverKind;
  readonly instanceId?: ProviderInstanceId;
  readonly threadRef?: ScopedThreadRef;
  readonly draftId?: DraftId;
  readonly model: string;
  readonly models: ReadonlyArray<ServerProviderModel>;
  readonly modelOptions: ReadonlyArray<ProviderOptionSelection> | undefined;
  readonly prompt: string;
  readonly onPromptChange: (prompt: string) => void;
  readonly planModeEnabled: boolean;
}

export interface CodexPickerProvider {
  readonly entry: ProviderInstanceEntry;
  readonly models: ReadonlyArray<ModelEsque>;
  /** Why the provider cannot be used right now, or null when it can. */
  readonly unavailableReason: string | null;
}

type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;
type BooleanDescriptor = Extract<ProviderOptionDescriptor, { type: "boolean" }>;

export interface CodexEffortOption {
  readonly id: string;
  readonly label: string;
  readonly description: string | undefined;
  readonly isDefault: boolean;
}

export interface CodexPickerTraitState {
  readonly effort: {
    readonly value: string | null;
    readonly options: ReadonlyArray<CodexEffortOption>;
    readonly lockedByPrompt: boolean;
  } | null;
  readonly fastMode: { readonly on: boolean } | null;
  /** Remaining toggles and choices (thinking, context window, agent, …). */
  readonly extras: ReadonlyArray<ProviderOptionDescriptor>;
  readonly setEffort: (value: string) => void;
  readonly setFastMode: (on: boolean) => void;
  readonly setExtra: (id: string, value: string | boolean) => void;
}

const EXTRA_SELECT_IDS = new Set(["contextWindow", "agent", "serviceTier"]);
const ULTRATHINK_PREFIX = "Ultrathink:\n";

function codexFastTier(descriptor: SelectDescriptor | undefined) {
  return descriptor?.options.find((option) => option.label === "Fast") ?? null;
}

function replaceValue(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
  id: string,
  value: string | boolean,
): ReadonlyArray<ProviderOptionDescriptor> {
  return descriptors.map((descriptor) =>
    descriptor.id !== id
      ? descriptor
      : descriptor.type === "boolean"
        ? { ...descriptor, ...(typeof value === "boolean" ? { currentValue: value } : {}) }
        : { ...descriptor, ...(typeof value === "string" ? { currentValue: value } : {}) },
  );
}

/**
 * Effort, fast mode and the other per-model options for the selected model,
 * read and written exactly like upstream's TraitsMenuContent: descriptors from
 * the model's capabilities, saved through the composer draft store.
 */
export function useCodexPickerTraits(traits: CodexPickerTraits): CodexPickerTraitState {
  const setProviderModelOptions = useComposerDraftStore((store) => store.setProviderModelOptions);

  return useMemo(() => {
    const caps = getProviderModelCapabilities(
      traits.models,
      traits.model,
      traits.provider,
      traits.planModeEnabled,
    );
    const descriptors = getProviderOptionDescriptors({ caps, selections: traits.modelOptions });
    const selects = descriptors.filter(
      (descriptor): descriptor is SelectDescriptor => descriptor.type === "select",
    );
    const booleans = descriptors.filter(
      (descriptor): descriptor is BooleanDescriptor => descriptor.type === "boolean",
    );
    const effortDescriptor = selects.find((descriptor) => !EXTRA_SELECT_IDS.has(descriptor.id));
    const fastBoolean = booleans.find((descriptor) => descriptor.id === "fastMode");
    const serviceTier =
      traits.provider === "codex"
        ? selects.find((descriptor) => descriptor.id === "serviceTier")
        : undefined;
    const fastTier = codexFastTier(serviceTier);
    const promptUltrathink =
      (effortDescriptor?.promptInjectedValues?.length ?? 0) > 0 &&
      isClaudeUltrathinkPrompt(traits.prompt);
    const ultrathinkInBody =
      promptUltrathink && isClaudeUltrathinkPrompt(traits.prompt.replace(/^Ultrathink:\s*/i, ""));

    const save = (next: ReadonlyArray<ProviderOptionDescriptor>) => {
      const target = traits.threadRef ?? traits.draftId;
      if (!target) return;
      setProviderModelOptions(
        target,
        traits.provider,
        buildProviderOptionSelectionsFromDescriptors(next),
        {
          ...(traits.instanceId ? { instanceId: traits.instanceId } : {}),
          model: traits.model,
          persistSticky: true,
        },
      );
    };

    const effortValue = effortDescriptor
      ? promptUltrathink
        ? "ultrathink"
        : (() => {
            const value = getProviderOptionCurrentValue(effortDescriptor);
            return typeof value === "string" ? value : null;
          })()
      : null;

    return {
      effort: effortDescriptor
        ? {
            value: effortValue,
            lockedByPrompt: ultrathinkInBody,
            options: effortDescriptor.options.map((option) => ({
              id: option.id,
              label: option.label,
              description: option.description,
              isDefault: option.isDefault === true,
            })),
          }
        : null,
      fastMode: fastBoolean
        ? { on: fastBoolean.currentValue === true }
        : fastTier && serviceTier
          ? { on: getProviderOptionCurrentValue(serviceTier) === fastTier.id }
          : null,
      extras: descriptors.filter(
        (descriptor) =>
          descriptor !== effortDescriptor &&
          descriptor !== fastBoolean &&
          !(fastTier && descriptor === serviceTier),
      ),
      setEffort: (value) => {
        if (!effortDescriptor || ultrathinkInBody) return;
        if (effortDescriptor.promptInjectedValues?.includes(value)) {
          traits.onPromptChange(
            traits.prompt.trim().length === 0
              ? ULTRATHINK_PREFIX
              : applyClaudePromptEffortPrefix(traits.prompt, "ultrathink"),
          );
          return;
        }
        if (promptUltrathink) {
          traits.onPromptChange(traits.prompt.replace(/^Ultrathink:\s*/i, ""));
        }
        save(replaceValue(descriptors, effortDescriptor.id, value));
      },
      setFastMode: (on) => {
        if (fastBoolean) save(replaceValue(descriptors, fastBoolean.id, on));
        else if (serviceTier && fastTier) {
          save(replaceValue(descriptors, serviceTier.id, on ? fastTier.id : "default"));
        }
      },
      setExtra: (id, value) => save(replaceValue(descriptors, id, value)),
    };
  }, [setProviderModelOptions, traits]);
}

/** Providers in picker order, each with its selectable models. */
export function useCodexPickerProviders(input: {
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey: string | null | undefined;
}): ReadonlyArray<CodexPickerProvider> {
  const { instanceEntries, modelOptionsByInstance, lockedProvider, lockedContinuationGroupKey } =
    input;
  return useMemo(
    () =>
      instanceEntries
        .filter((entry) => entry.enabled)
        .filter(
          (entry) =>
            lockedProvider === null ||
            (entry.driverKind === lockedProvider &&
              (!lockedContinuationGroupKey ||
                entry.continuationGroupKey === lockedContinuationGroupKey)),
        )
        .map((entry) => {
          const models = (modelOptionsByInstance.get(entry.instanceId) ?? []).filter(
            (model) => !model.isLegacy,
          );
          const unavailableReason = !entry.installed
            ? "Not installed"
            : entry.snapshot.auth.status === "unauthenticated"
              ? "Signed out"
              : !isProviderInstancePickerReady(entry)
                ? "Unavailable"
                : models.length === 0
                  ? "No models"
                  : null;
          return { entry, models, unavailableReason };
        }),
    [instanceEntries, lockedContinuationGroupKey, lockedProvider, modelOptionsByInstance],
  );
}

/** Favourite models, shared with upstream's picker (client setting `favorites`). */
export function useCodexPickerFavorites() {
  const favorites = useClientSettings((settings) => settings.favorites ?? []);
  const updateSettings = useUpdateClientSettings();
  return useMemo(() => {
    const keys = new Set(
      favorites.map((favorite) => providerModelKey(favorite.provider, favorite.model)),
    );
    return {
      isFavorite: (instanceId: ProviderInstanceId, model: string) =>
        keys.has(providerModelKey(instanceId, model)),
      toggle: (instanceId: ProviderInstanceId, model: string) => {
        const exists = favorites.some(
          (favorite) => favorite.provider === instanceId && favorite.model === model,
        );
        updateSettings({
          favorites: exists
            ? favorites.filter(
                (favorite) => !(favorite.provider === instanceId && favorite.model === model),
              )
            : [...favorites, { provider: instanceId, model }],
        });
      },
    };
  }, [favorites, updateSettings]);
}

export function modelDisplayName(model: ModelEsque): string {
  return model.shortName ?? model.name;
}

export function matchesQuery(query: string, ...values: ReadonlyArray<string | undefined>) {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return values.some((value) => value?.toLowerCase().includes(needle));
}

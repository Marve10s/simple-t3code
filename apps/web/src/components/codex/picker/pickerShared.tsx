import type { ProviderInstanceId } from "@t3tools/contracts";
import { getProviderOptionCurrentValue } from "@t3tools/shared/model";
import { CheckIcon, ZapIcon } from "lucide-react";

import type { ProviderInstanceEntry } from "../../../providerInstances";
import { ProviderInstanceIcon } from "../../chat/ProviderInstanceIcon";
import { Switch } from "../../ui/switch";
import type {
  CodexPickerProvider,
  CodexPickerTraitState,
  useCodexPickerFavorites,
} from "./codexPickerData";

export interface PickerDesignProps {
  readonly providers: ReadonlyArray<CodexPickerProvider>;
  readonly activeInstanceId: ProviderInstanceId;
  readonly activeModel: string;
  readonly traits: CodexPickerTraitState;
  readonly favorites: ReturnType<typeof useCodexPickerFavorites>;
  readonly isModelDisabled: (instanceId: ProviderInstanceId, model: string) => string | null;
  readonly selectModel: (instanceId: ProviderInstanceId, model: string) => void;
  readonly openProviderSetup: (instanceId: ProviderInstanceId) => void;
}

export function ProviderGlyph({ entry }: { entry: ProviderInstanceEntry }) {
  return (
    <ProviderInstanceIcon
      driverKind={entry.driverKind}
      displayName={entry.displayName}
      accentColor={entry.accentColor}
      className="size-4"
      iconClassName="size-4"
    />
  );
}

export function FastModeRow({ traits }: { traits: CodexPickerTraitState }) {
  if (!traits.fastMode) return null;
  const fastMode = traits.fastMode;
  return (
    <label data-codex-part="picker-row" data-kind="toggle">
      <ZapIcon data-codex-part="picker-row-icon" data-on={fastMode.on ? "true" : undefined} />
      <span data-codex-part="picker-row-label">Fast mode</span>
      <Switch
        checked={fastMode.on}
        onCheckedChange={(checked) => traits.setFastMode(Boolean(checked))}
        aria-label="Fast mode"
      />
    </label>
  );
}

export function EffortList({
  traits,
  onPicked,
}: {
  traits: CodexPickerTraitState;
  onPicked?: () => void;
}) {
  if (!traits.effort) return null;
  const effort = traits.effort;
  return (
    <div data-codex-part="picker-effort-list" role="radiogroup" aria-label="Effort">
      {effort.lockedByPrompt ? (
        <p data-codex-part="picker-note">
          Your prompt says “ultrathink”. Remove it to change the effort.
        </p>
      ) : null}
      {effort.options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={effort.value === option.id}
          disabled={effort.lockedByPrompt}
          data-codex-part="picker-row"
          data-kind="option"
          data-active={effort.value === option.id ? "true" : undefined}
          onClick={() => {
            traits.setEffort(option.id);
            onPicked?.();
          }}
        >
          <span data-codex-part="picker-row-text">
            <span data-codex-part="picker-row-label">
              {option.label}
              {option.isDefault ? <span data-codex-part="picker-tag">Default</span> : null}
            </span>
            {option.description ? (
              <span data-codex-part="picker-row-description">{option.description}</span>
            ) : null}
          </span>
          {effort.value === option.id ? (
            <CheckIcon data-codex-part="picker-check" data-on="true" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function ExtraOptions({ traits }: { traits: CodexPickerTraitState }) {
  if (traits.extras.length === 0) return null;
  return (
    <div data-codex-part="picker-extras">
      {traits.extras.map((descriptor) =>
        descriptor.type === "boolean" ? (
          <label key={descriptor.id} data-codex-part="picker-row" data-kind="toggle">
            <span data-codex-part="picker-row-label">{descriptor.label}</span>
            <Switch
              checked={descriptor.currentValue === true}
              onCheckedChange={(checked) => traits.setExtra(descriptor.id, Boolean(checked))}
              aria-label={descriptor.label}
            />
          </label>
        ) : (
          <div key={descriptor.id} data-codex-part="picker-row" data-kind="segmented">
            <span data-codex-part="picker-row-label">{descriptor.label}</span>
            <span
              data-codex-part="picker-segmented"
              role="radiogroup"
              aria-label={descriptor.label}
            >
              {descriptor.options.map((option) => {
                const active = getProviderOptionCurrentValue(descriptor) === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-active={active ? "true" : undefined}
                    onClick={() => traits.setExtra(descriptor.id, option.id)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

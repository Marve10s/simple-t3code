import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { ZapIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";

import type { ProviderInstanceEntry } from "../../../providerInstances";
import { ComposerControl, ComposerControlChevron } from "../../chat/ComposerControl";
import { useComposerMenuProps } from "../../chat/composerEventScope";
import { ProviderInstanceIcon } from "../../chat/ProviderInstanceIcon";
import { ProviderModelPicker } from "../../chat/ProviderModelPicker";
import { type ModelEsque } from "../../chat/providerIconUtils";
import { Popover, PopoverPopup, PopoverTrigger } from "../../ui/popover";
import {
  type CodexPickerTraits,
  modelDisplayName,
  useCodexPickerFavorites,
  useCodexPickerProviders,
  useCodexPickerTraits,
} from "./codexPickerData";
import { PickerClassic } from "./PickerClassic";
import type { PickerDesignProps } from "./pickerShared";
import "./codexPicker.css";

type UpstreamPickerProps = ComponentProps<typeof ProviderModelPicker>;

export function CodexModelPicker(
  props: UpstreamPickerProps & {
    traits: CodexPickerTraits | null;
    keybindings?: ResolvedKeybindingsConfig;
  },
) {
  if (props.selectedModels !== undefined || !props.traits) {
    return <ProviderModelPicker {...props} />;
  }
  return <CodexModelPickerPopover {...props} traits={props.traits} />;
}

function CodexModelPickerPopover(props: UpstreamPickerProps & { traits: CodexPickerTraits }) {
  const composerFloatingLayerProps = useComposerMenuProps();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = props.open ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    props.onOpenChange?.(next);
    if (props.open === undefined) setUncontrolledOpen(next);
  };

  const providers = useCodexPickerProviders({
    instanceEntries: props.instanceEntries,
    modelOptionsByInstance: props.modelOptionsByInstance,
    lockedProvider: props.lockedProvider,
    lockedContinuationGroupKey: props.lockedContinuationGroupKey,
  });
  const traitState = useCodexPickerTraits(props.traits);
  const favorites = useCodexPickerFavorites();

  const activeEntry: ProviderInstanceEntry | null =
    props.instanceEntries.find((entry) => entry.instanceId === props.activeInstanceId) ?? null;
  const activeModel: ModelEsque | null =
    (props.modelOptionsByInstance.get(props.activeInstanceId) ?? []).find(
      (model) => model.slug === props.model,
    ) ?? null;
  const effortLabel =
    traitState.effort?.options.find((option) => option.id === traitState.effort?.value)?.label ??
    (traitState.effort?.value === "ultrathink" ? "Ultrathink" : null);

  const designProps: PickerDesignProps = {
    providers,
    activeInstanceId: props.activeInstanceId,
    activeModel: props.model,
    traits: traitState,
    favorites,
    isModelDisabled: (instanceId, model) =>
      props.getModelDisabledReason?.(instanceId, model) ?? null,
    selectModel: (instanceId, model) => {
      if (props.disabled) return;
      if (instanceId !== props.activeInstanceId || model !== props.model) {
        props.onInstanceModelChange(instanceId, model);
      }
      setOpen(false);
    },
    openProviderSetup: (instanceId) => {
      props.onOpenProviderSetup?.(instanceId);
      setOpen(false);
    },
  };

  const size = props.size ?? "sm";
  return (
    <Popover open={open} onOpenChange={(next) => setOpen(props.disabled ? false : next)}>
      <PopoverTrigger
        render={
          <ComposerControl
            size={size}
            disabled={props.disabled}
            data-codex-model-picker=""
            aria-label={`Model: ${activeModel ? modelDisplayName(activeModel) : props.model}${effortLabel ? `, ${effortLabel}` : ""}${traitState.fastMode?.on ? ", fast mode" : ""}`}
            className={props.triggerClassName}
          />
        }
      >
        {activeEntry ? (
          <ProviderInstanceIcon
            driverKind={activeEntry.driverKind}
            displayName={activeEntry.displayName}
            accentColor={activeEntry.accentColor}
            className="size-4"
            iconClassName="size-4"
          />
        ) : null}
        <span data-codex-part="picker-trigger-model">
          {activeModel ? modelDisplayName(activeModel) : props.model || "Choose model"}
        </span>
        {effortLabel ? <span data-codex-part="picker-trigger-effort">{effortLabel}</span> : null}
        {traitState.fastMode?.on ? (
          <ZapIcon data-codex-part="picker-trigger-fast" aria-hidden="true" />
        ) : null}
        <ComposerControlChevron size={size} />
      </PopoverTrigger>
      <PopoverPopup
        {...(props.isComposerOwned ? composerFloatingLayerProps : {})}
        align="end"
        side="top"
        sideOffset={8}
        padding="none"
        className="before:hidden"
      >
        <div data-codex-part="picker" data-model-picker-content="">
          <PickerClassic {...designProps} />
        </div>
      </PopoverPopup>
    </Popover>
  );
}

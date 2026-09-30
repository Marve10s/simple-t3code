import type { ProviderInstanceId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronRightIcon,
  GaugeIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react";
import { type SyntheticEvent, useState } from "react";

import type { ModelEsque } from "../../chat/providerIconUtils";

import {
  type CodexPickerProvider,
  matchesQuery,
  modelDisplayName,
  sectionPickerModels,
} from "./codexPickerData";
import {
  EffortList,
  ExtraOptions,
  FastModeRow,
  type PickerDesignProps,
  ProviderGlyph,
} from "./pickerShared";

type Flyout =
  | { kind: "provider"; instanceId: ProviderInstanceId; top: number }
  | { kind: "effort"; top: number }
  | null;

export function PickerClassic(props: PickerDesignProps) {
  const navigate = useNavigate();
  const [flyout, setFlyout] = useState<Flyout>(() =>
    props.providers.some((provider) => provider.entry.instanceId === props.activeInstanceId)
      ? { kind: "provider", instanceId: props.activeInstanceId, top: 0 }
      : null,
  );
  const [query, setQuery] = useState("");
  const [openSections, setOpenSections] = useState<ReadonlyMap<string, boolean>>(new Map());
  const openAt = (event: SyntheticEvent<HTMLElement>, next: NonNullable<Flyout>) => {
    const top = event.currentTarget.offsetTop;
    setFlyout((current) =>
      current?.kind === next.kind &&
      (next.kind !== "provider" ||
        (current.kind === "provider" && current.instanceId === next.instanceId))
        ? current
        : { ...next, top },
    );
    if (next.kind === "provider") {
      setQuery("");
      setOpenSections(new Map());
    }
  };

  const flyoutProvider =
    flyout?.kind === "provider"
      ? (props.providers.find((provider) => provider.entry.instanceId === flyout.instanceId) ??
        null)
      : null;
  const effortLabel =
    props.traits.effort?.options.find((option) => option.id === props.traits.effort?.value)
      ?.label ?? null;

  return (
    <div data-codex-part="picker-classic">
      <div data-codex-part="picker-column">
        {props.providers.map((provider) => (
          <button
            key={provider.entry.instanceId}
            type="button"
            data-codex-part="picker-row"
            data-kind="provider"
            data-active={
              flyout?.kind === "provider" && flyout.instanceId === provider.entry.instanceId
                ? "true"
                : undefined
            }
            data-muted={provider.unavailableReason ? "true" : undefined}
            onMouseEnter={(event) =>
              openAt(event, { kind: "provider", instanceId: provider.entry.instanceId, top: 0 })
            }
            onFocus={(event) =>
              openAt(event, { kind: "provider", instanceId: provider.entry.instanceId, top: 0 })
            }
            onClick={() => {
              if (provider.unavailableReason) props.openProviderSetup(provider.entry.instanceId);
            }}
          >
            <ProviderGlyph entry={provider.entry} />
            <span data-codex-part="picker-row-label">{provider.entry.displayName}</span>
            {provider.entry.instanceId === props.activeInstanceId ? (
              <span data-codex-part="picker-dot" aria-label="Current provider" />
            ) : null}
            {provider.unavailableReason ? (
              <span data-codex-part="picker-tag">{provider.unavailableReason}</span>
            ) : (
              <ChevronRightIcon data-codex-part="picker-chevron" />
            )}
          </button>
        ))}
        {props.traits.effort || props.traits.fastMode ? (
          <div data-codex-part="picker-divider" />
        ) : null}
        {props.traits.effort ? (
          <button
            type="button"
            data-codex-part="picker-row"
            data-kind="provider"
            data-active={flyout?.kind === "effort" ? "true" : undefined}
            onMouseEnter={(event) => openAt(event, { kind: "effort", top: 0 })}
            onFocus={(event) => openAt(event, { kind: "effort", top: 0 })}
          >
            <GaugeIcon data-codex-part="picker-row-icon" />
            <span data-codex-part="picker-row-label">Effort</span>
            {effortLabel ? <span data-codex-part="picker-row-value">{effortLabel}</span> : null}
            <ChevronRightIcon data-codex-part="picker-chevron" />
          </button>
        ) : null}
        <FastModeRow traits={props.traits} />
        <ExtraOptions traits={props.traits} />
        <div data-codex-part="picker-divider" />
        <button
          type="button"
          data-codex-part="picker-row"
          data-kind="action"
          onMouseEnter={() => setFlyout(null)}
          onClick={() => void navigate({ to: "/settings/providers" })}
        >
          <PlusIcon data-codex-part="picker-row-icon" />
          <span data-codex-part="picker-row-label">Add providers</span>
        </button>
      </div>

      {flyout ? (
        <div data-codex-part="picker-flyout" style={{ top: Math.max(0, flyout.top - 6) }}>
          {flyoutProvider ? (
            <>
              <label data-codex-part="picker-search">
                <SearchIcon />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${flyoutProvider.entry.displayName}`}
                  aria-label={`Search ${flyoutProvider.entry.displayName} models`}
                />
              </label>
              <div data-codex-part="picker-group-label">{flyoutProvider.entry.displayName}</div>
              <div data-codex-part="picker-scroll">
                {sectionPickerModels({
                  driverKind: flyoutProvider.entry.driverKind,
                  models: flyoutProvider.models.filter((model) =>
                    matchesQuery(query, model.name, model.shortName, model.slug, model.subProvider),
                  ),
                  pinned: (slug) =>
                    (flyoutProvider.entry.instanceId === props.activeInstanceId &&
                      slug === props.activeModel) ||
                    props.favorites.isFavorite(flyoutProvider.entry.instanceId, slug),
                }).map((section) => {
                  const expanded =
                    section.label === null ||
                    query.trim().length > 0 ||
                    (openSections.get(section.id) ??
                      section.models.some(
                        (model) =>
                          flyoutProvider.entry.instanceId === props.activeInstanceId &&
                          model.slug === props.activeModel,
                      ));
                  return (
                    <div key={section.id} data-codex-part="picker-section">
                      {section.label === null ? null : (
                        <button
                          type="button"
                          data-codex-part="picker-section-toggle"
                          aria-expanded={expanded}
                          onClick={() =>
                            setOpenSections((current) =>
                              new Map(current).set(section.id, !expanded),
                            )
                          }
                        >
                          <ChevronRightIcon data-codex-part="picker-section-chevron" />
                          <span data-codex-part="picker-row-label">{section.label}</span>
                          <span data-codex-part="picker-row-value">{section.models.length}</span>
                        </button>
                      )}
                      {expanded
                        ? section.models.map((model) => (
                            <ModelRow
                              key={model.slug}
                              {...props}
                              provider={flyoutProvider}
                              model={model}
                            />
                          ))
                        : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : flyout.kind === "effort" ? (
            <>
              <div data-codex-part="picker-group-label">Effort</div>
              <EffortList traits={props.traits} />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ModelRow(props: PickerDesignProps & { provider: CodexPickerProvider; model: ModelEsque }) {
  const instanceId = props.provider.entry.instanceId;
  const active = instanceId === props.activeInstanceId && props.model.slug === props.activeModel;
  const disabledReason =
    props.provider.unavailableReason ?? props.isModelDisabled(instanceId, props.model.slug);
  const favorite = props.favorites.isFavorite(instanceId, props.model.slug);
  return (
    <div
      data-codex-part="picker-row"
      data-kind="model"
      data-active={active ? "true" : undefined}
      data-muted={disabledReason ? "true" : undefined}
    >
      <button
        type="button"
        data-codex-part="picker-row-main"
        disabled={disabledReason !== null}
        onClick={() => props.selectModel(instanceId, props.model.slug)}
      >
        <span data-codex-part="picker-row-label">{modelDisplayName(props.model)}</span>
        {props.model.badge === "new" ? <span data-codex-part="picker-tag">New</span> : null}
        <CheckIcon data-codex-part="picker-check" data-on={active ? "true" : undefined} />
      </button>
      <button
        type="button"
        aria-label={favorite ? "Remove from starred" : "Star model"}
        aria-pressed={favorite}
        data-codex-part="picker-star"
        data-on={favorite ? "true" : undefined}
        onClick={() => props.favorites.toggle(instanceId, props.model.slug)}
      >
        <StarIcon />
      </button>
    </div>
  );
}

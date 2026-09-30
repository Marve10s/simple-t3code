import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { CheckIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isMonospaceFamily, queryInstalledFontFamilies } from "../../appearanceFonts";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxSearchInput,
  ComboboxItem,
  ComboboxListVirtualized,
  ComboboxPopup,
  ComboboxTrigger,
} from "../ui/combobox";
import { SelectButton } from "../ui/select";

const DEFAULT_FONT_VALUE = "__default__";

function supportsFontEnumeration(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as { queryLocalFonts?: unknown }).queryLocalFonts === "function"
  );
}

type FontEnumerationState =
  | { readonly status: "unknown" }
  | { readonly status: "granted"; readonly families: readonly string[] }
  | { readonly status: "unavailable" };

let enumerationState: FontEnumerationState = supportsFontEnumeration()
  ? { status: "unknown" }
  : { status: "unavailable" };
const enumerationListeners = new Set<() => void>();

function subscribeToEnumeration(listener: () => void): () => void {
  enumerationListeners.add(listener);
  return () => enumerationListeners.delete(listener);
}

function readEnumerationState(): FontEnumerationState {
  return enumerationState;
}

let enumerationLoad: Promise<void> | null = null;

export function discoverInstalledFonts(): void {
  if (enumerationState.status !== "unknown" || enumerationLoad !== null) return;
  enumerationLoad = queryInstalledFontFamilies().then((result) => {
    enumerationState =
      result.status === "granted"
        ? { status: "granted", families: result.families }
        : { status: "unavailable" };
    enumerationLoad = null;
    for (const listener of enumerationListeners) listener();
  });
}

let grantedProbeStarted = false;

function probeAlreadyGrantedPermission(): void {
  if (grantedProbeStarted || enumerationState.status !== "unknown") return;
  grantedProbeStarted = true;
  const permissions = typeof navigator !== "undefined" ? navigator.permissions : undefined;
  if (typeof permissions?.query !== "function") return;
  permissions.query({ name: "local-fonts" as PermissionName }).then(
    (status) => {
      if (status.state === "granted") discoverInstalledFonts();
    },
    () => {},
  );
}

export function useFontEnumeration(): FontEnumerationState {
  useEffect(probeAlreadyGrantedPermission, []);
  return useSyncExternalStore(subscribeToEnumeration, readEnumerationState);
}

export function FontFamilyPicker({
  ariaLabel,
  defaultFamily,
  selectedFamily,
  requireMonospace = false,
  initialOpen = false,
  onSelect,
}: {
  ariaLabel: string;
  defaultFamily: string;
  selectedFamily: string;
  requireMonospace?: boolean;
  initialOpen?: boolean;
  onSelect: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (initialOpen) setOpen(true);
  }, []);
  const listRef = useRef<LegendListRef | null>(null);
  const enumeration = useFontEnumeration();

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setQuery("");
  };

  const families = useMemo(() => {
    if (enumeration.status !== "granted") return [];
    return requireMonospace ? enumeration.families.filter(isMonospaceFamily) : enumeration.families;
  }, [enumeration, requireMonospace]);

  const items = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    const result: string[] = [];
    if (trimmedQuery.length === 0) result.push(DEFAULT_FONT_VALUE);
    result.push(
      ...families.filter(
        (family) => trimmedQuery.length === 0 || family.toLowerCase().includes(trimmedQuery),
      ),
    );
    return result;
  }, [query, families]);

  const selectedValue = selectedFamily.length === 0 ? DEFAULT_FONT_VALUE : selectedFamily;

  const handlePick = (value: string) => {
    setOpen(false);
    onSelect(value === DEFAULT_FONT_VALUE ? "" : value);
  };

  const renderItem = (item: string, index: number) => {
    const isDefault = item === DEFAULT_FONT_VALUE;
    const family = isDefault ? defaultFamily : item;
    return (
      <ComboboxItem hideIndicator index={index} key={item} value={item}>
        <div className="flex w-full min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate" style={{ fontFamily: family }}>
            {family}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {isDefault ? <span className="text-3xs text-muted-foreground/60">default</span> : null}
            {item === selectedValue ? (
              <CheckIcon className="size-3.5 text-muted-foreground" />
            ) : null}
          </span>
        </div>
      </ComboboxItem>
    );
  };

  return (
    <Combobox
      items={items}
      filteredItems={items}
      autoHighlight
      virtualized
      open={open}
      onOpenChange={handleOpenChange}
      value={selectedValue}
      onValueChange={(next) => {
        if (typeof next === "string") handlePick(next);
      }}
      onItemHighlighted={(_value, eventDetails) => {
        if (!open || eventDetails.index < 0 || eventDetails.reason !== "keyboard") return;
        void listRef.current?.scrollIndexIntoView?.({ index: eventDetails.index, animated: false });
      }}
    >
      <ComboboxTrigger aria-label={ariaLabel} render={<SelectButton size="sm" />}>
        {selectedFamily.length === 0 ? defaultFamily : selectedFamily}
      </ComboboxTrigger>
      <ComboboxPopup align="end" className="flex w-72 flex-col">
        <ComboboxSearchInput
          placeholder="Search fonts…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ComboboxEmpty>No fonts found.</ComboboxEmpty>
          <div className="relative min-h-0 max-h-72 w-full flex-1 overflow-hidden">
            <ComboboxListVirtualized>
              <LegendList<string>
                ref={listRef}
                data={items}
                keyExtractor={(item) => item}
                renderItem={({ item, index }) => renderItem(item, index)}
                estimatedItemSize={30}
                drawDistance={360}
                style={{ height: Math.min(items.length * 30, 288) }}
              />
            </ComboboxListVirtualized>
          </div>
        </div>
      </ComboboxPopup>
    </Combobox>
  );
}

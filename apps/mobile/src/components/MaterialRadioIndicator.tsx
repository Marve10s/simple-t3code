import { SymbolView } from "./AppSymbol";

export function MaterialRadioIndicator({ selected }: { readonly selected: boolean }) {
  return selected ? (
    <SymbolView name="checkmark" size={16} tintColorClassName="accent-icon" />
  ) : null;
}

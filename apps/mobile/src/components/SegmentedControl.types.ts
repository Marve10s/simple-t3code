export interface SegmentedControlProps<Value extends number | string> {
  readonly options: readonly {
    readonly value: Value;
    readonly label: string;
    readonly accessibilityLabel?: string;
  }[];
  readonly selected: Value;
  readonly onSelect: (value: Value) => void;
  readonly size?: "default" | "compact";
  readonly role?: "tab" | "button";
  readonly className?: string;
}

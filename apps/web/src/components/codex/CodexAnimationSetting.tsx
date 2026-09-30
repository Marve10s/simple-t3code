import { SettingsRow } from "../settings/settingsLayout";
import { Badge } from "../ui/badge";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  type CodexAnimationStyle,
  decodeCodexAnimationStyle,
  useCodexAnimationStyle,
} from "./codexAnimations";

const LABELS: Record<CodexAnimationStyle, string> = {
  standard: "Standard",
  motion: "Motion",
};

export function CodexAnimationSetting() {
  const [style, setStyle] = useCodexAnimationStyle();
  return (
    <SettingsRow
      id="animation-style"
      title={
        <span className="inline-flex items-center gap-2">
          Animation style
          {style === "motion" ? (
            <Badge size="sm" variant="success">
              Better
            </Badge>
          ) : null}
        </span>
      }
      description="Motion adds smoother tabs, navigation, and new-chat transitions. It loads only while selected; Standard keeps T3 Code's built-in animations and never loads it."
      control={
        <Select value={style} onValueChange={(value) => setStyle(decodeCodexAnimationStyle(value))}>
          <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Animation style">
            <SelectValue>{LABELS[style]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            <SelectItem hideIndicator value="motion">
              Motion (better)
            </SelectItem>
            <SelectItem hideIndicator value="standard">
              Standard
            </SelectItem>
          </SelectPopup>
        </Select>
      }
    />
  );
}

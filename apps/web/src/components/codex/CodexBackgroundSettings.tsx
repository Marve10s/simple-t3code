import { ImagePlusIcon, ShuffleIcon, XIcon } from "lucide-react";
import { useRef } from "react";

import { SettingsRow, SettingsSection } from "../settings/settingsLayout";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import {
  addCustomBackgrounds,
  removeCustomBackground,
  useCustomBackgrounds,
} from "./codexBackgroundStore";
import {
  BUNDLED_BACKGROUNDS,
  type CodexBackground,
  useCodexBackgroundChoice,
  useCodexBackgroundEnabled,
} from "./codexBackgrounds";

/** Settings → Appearance → New chat background. */
export function CodexBackgroundSettings() {
  const [enabled, setEnabled] = useCodexBackgroundEnabled();
  const [choice, setChoice] = useCodexBackgroundChoice();
  const customBackgrounds = useCustomBackgrounds();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const renderTile = (background: CodexBackground, removable: boolean) => (
    <div
      key={background.id}
      data-codex-part="background-tile"
      data-selected={choice === background.id ? "true" : undefined}
    >
      <button
        type="button"
        aria-label={`Use ${background.title}`}
        aria-pressed={choice === background.id}
        onClick={() => setChoice(choice === background.id ? "random" : background.id)}
      >
        <img src={background.thumbnail} alt="" loading="lazy" decoding="async" />
      </button>
      {removable ? (
        <button
          type="button"
          aria-label={`Remove ${background.title}`}
          data-codex-part="background-tile-remove"
          onClick={() => {
            if (choice === background.id) setChoice("random");
            void removeCustomBackground(background.id);
          }}
        >
          <XIcon />
        </button>
      ) : null}
    </div>
  );

  return (
    <SettingsSection id="new-chat-background" title="New chat background">
      <SettingsRow
        id="background-enabled"
        title="Show a background"
        description="A picture behind the new-chat prompt. Random gives every new chat its own; pick one to keep it."
        control={
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(Boolean(checked))}
            aria-label="Show a background on new chats"
          />
        }
      />
      {enabled ? (
        <div data-codex-part="background-grid">
          <div
            data-codex-part="background-tile"
            data-selected={choice === "random" ? "true" : undefined}
          >
            <button
              type="button"
              aria-pressed={choice === "random"}
              data-codex-part="background-tile-action"
              onClick={() => setChoice("random")}
            >
              <ShuffleIcon />
              Random
            </button>
          </div>
          {BUNDLED_BACKGROUNDS.map((background) => renderTile(background, false))}
          {customBackgrounds.map((background) => renderTile(background, true))}
          <div data-codex-part="background-tile">
            <button
              type="button"
              data-codex-part="background-tile-action"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlusIcon />
              Add image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                void addCustomBackgrounds(files).catch((error: unknown) =>
                  toastManager.add({
                    type: "error",
                    title: "Could not add image",
                    description: error instanceof Error ? error.message : "An error occurred.",
                  }),
                );
              }}
            />
          </div>
        </div>
      ) : null}
    </SettingsSection>
  );
}

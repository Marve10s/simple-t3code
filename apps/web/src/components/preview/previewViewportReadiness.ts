import type { PreviewRenderedViewportSize, PreviewViewportSetting } from "@t3tools/contracts";

import { browserViewportSettingKey } from "~/browser/browserViewportLayout";

export function isPreviewViewportReady(input: {
  readonly setting: PreviewViewportSetting;
  readonly appliedSettingKey: string | null;
  readonly declaredViewport: PreviewRenderedViewportSize | null;
  readonly renderedViewport: PreviewRenderedViewportSize | null;
}): boolean {
  const { setting, appliedSettingKey, declaredViewport, renderedViewport } = input;
  if (
    appliedSettingKey !== browserViewportSettingKey(setting) ||
    declaredViewport === null ||
    renderedViewport === null
  ) {
    return false;
  }

  const expectedViewport =
    setting._tag === "fill" ? declaredViewport : { width: setting.width, height: setting.height };
  if (
    setting._tag !== "fill" &&
    (declaredViewport.width !== expectedViewport.width ||
      declaredViewport.height !== expectedViewport.height)
  ) {
    return false;
  }

  const tolerance = 1;
  return (
    Math.abs(renderedViewport.width - expectedViewport.width) <= tolerance &&
    Math.abs(renderedViewport.height - expectedViewport.height) <= tolerance
  );
}

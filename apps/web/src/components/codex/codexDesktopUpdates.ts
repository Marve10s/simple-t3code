import type { DesktopUpdateActionResult } from "@t3tools/contracts";
import { toastManager } from "../ui/toast";

export const SIMPLE_DESKTOP_RELEASES_URL = "https://github.com/Marve10s/simple-t3code/releases";

export function showSimpleDesktopUpdateDownloadResult(result: DesktopUpdateActionResult) {
  if (
    !result.accepted ||
    result.completed ||
    result.state.message ||
    result.state.status !== "available"
  )
    return;
  toastManager.add({
    type: "info",
    title: "Release downloads opened",
    description:
      "Download the build for your computer, quit SimpleT3Code, then replace the app or run the installer. Your chats and settings stay on this device.",
  });
}

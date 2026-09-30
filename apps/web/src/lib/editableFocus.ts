const EDITABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
].join(",");

export function isEditableFocused(target: EventTarget | null = document.activeElement): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null;
}

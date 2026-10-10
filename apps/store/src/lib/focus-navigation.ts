const FIELD_SELECTOR = [
  'input:not([type="checkbox"]):not([type="file"]):not([type="hidden"]):not([disabled])',
  "textarea:not([disabled])",
  '[role="combobox"]:not([disabled])',
].join(", ");

/** Focus the next data-entry control (input / textarea / combobox trigger) after `from`. */
export function focusNextField(from: HTMLElement) {
  const scope = from.closest("form") ?? from.closest("main") ?? document;
  const fields = Array.from(scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR));
  const next = fields[fields.indexOf(from) + 1];
  if (!next) return;
  next.focus();
  if (next instanceof HTMLInputElement) next.select();
}

/**
 * Enter on a text/number input advances focus to the next field. Textareas keep
 * Enter as a newline, buttons/checkboxes/files keep native behavior.
 */
export function handleEnterAdvance(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter") return;
  const el = e.target as HTMLElement;
  if (el.tagName === "TEXTAREA" || el.tagName === "BUTTON") return;
  if (
    el instanceof HTMLInputElement &&
    (el.type === "checkbox" || el.type === "file" || el.type === "radio")
  )
    return;
  e.preventDefault();
  focusNextField(el);
}

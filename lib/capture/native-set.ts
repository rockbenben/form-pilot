/**
 * React/Vue-compatible native setters.
 *
 * Framework-controlled inputs track their state via monkey-patched prototype
 * setters; direct `el.value = x` / `el.checked = x` bypasses that tracking,
 * so the framework's next render overwrites the change. Invoking the prototype
 * setter preserves the tracking.
 */

export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const tag = el.tagName.toLowerCase();
  const proto =
    tag === 'textarea' ? HTMLTextAreaElement.prototype
    : tag === 'select' ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
}

export function setNativeChecked(el: HTMLInputElement, value: boolean): void {
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
  if (desc?.set) desc.set.call(el, value);
  else el.checked = value;
}

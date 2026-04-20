// lib/capture/element-value.ts
import type { CapturedFieldKind } from './types';

/**
 * Detect the CapturedFieldKind of an input-like element, or null if not
 * a serializable input (e.g. button, hidden, file, password).
 */
export function detectElementKind(el: Element): CapturedFieldKind | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'date' || type === 'datetime-local' || type === 'month' || type === 'week' || type === 'time') {
      return 'date';
    }
    if (['hidden', 'submit', 'reset', 'button', 'image', 'password', 'file'].includes(type)) {
      return null;
    }
    return 'text';
  }
  // Non-input editable regions — rich-text editors, custom comment boxes, etc.
  // Per HTML spec the attribute's affirmative values are 'true' or empty
  // string; fall through to `isContentEditable` (browser-computed, honors
  // inheritance) for everything else.
  const ce = el.getAttribute('contenteditable');
  // HTML-spec affirmative values: 'true', empty string, and 'plaintext-only'
  // (supported by Chromium and Safari, used by some lightweight editors).
  if (ce === 'true' || ce === '' || ce === 'plaintext-only') return 'contenteditable';
  if ((el as HTMLElement).isContentEditable) return 'contenteditable';
  return null;
}

/**
 * Separator used inside CapturedField.value for multi-select and any other
 * kind that needs to pack multiple strings into the single-string value slot.
 */
export const MULTI_VALUE_SEPARATOR = '\u001f';

/** Read the current value of an input/textarea/select/checkbox/radio as a string. */
export function readElementValue(el: Element): string {
  const kind = detectElementKind(el);
  if (!kind) return '';
  if (kind === 'checkbox') return (el as HTMLInputElement).checked ? 'true' : 'false';
  if (kind === 'radio') {
    const r = el as HTMLInputElement;
    return r.checked ? r.value : '';
  }
  if (kind === 'contenteditable') {
    return (el as HTMLElement).textContent?.trim() ?? '';
  }
  if (kind === 'select') {
    const s = el as HTMLSelectElement;
    if (s.multiple) {
      // Pack all selected option values into one string; joined by an
      // ASCII unit-separator that's vanishingly rare in form values.
      const values: string[] = [];
      for (const opt of Array.from(s.options)) {
        if (opt.selected) values.push(opt.value);
      }
      return values.join(MULTI_VALUE_SEPARATOR);
    }
    return s.value ?? '';
  }
  return (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value ?? '';
}

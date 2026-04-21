import type { InputType } from '@/lib/engine/adapters/types';
import { cssEscape } from '@/lib/capture/css-escape';
import { setNativeValue, setNativeChecked } from '@/lib/capture/native-set';
import { isVisuallyHidden, findVisualProxy } from '@/lib/capture/widget-proxy';

/**
 * Dispatch a sequence of DOM events on an element to simulate user interaction.
 */
function dispatchEvents(el: Element, events: string[]): void {
  for (const eventName of events) {
    let event: Event;
    if (eventName === 'input' || eventName === 'change') {
      event = new Event(eventName, { bubbles: true, cancelable: true });
    } else {
      event = new FocusEvent(eventName, { bubbles: true, cancelable: true });
    }
    el.dispatchEvent(event);
  }
}

/**
 * Fill a text or textarea element.
 */
async function fillText(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): Promise<boolean> {
  if (el.readOnly || el.disabled) return false;
  setNativeValue(el, value);
  dispatchEvents(el, ['focus', 'input', 'change', 'blur']);
  return el.value === value;
}

/**
 * Fill a <select> element by matching option text (exact then fuzzy/substring).
 */
async function fillSelect(el: HTMLSelectElement, value: string): Promise<boolean> {
  const options = Array.from(el.options);
  const lowerValue = value.toLowerCase();

  // Try exact text match first
  let matched = options.find(
    (opt) => opt.text.trim() === value || opt.value === value
  );

  // Fuzzy: substring match — option text contains value, or value contains option text
  if (!matched) {
    matched = options.find(
      (opt) =>
        opt.text.toLowerCase().includes(lowerValue) ||
        opt.value.toLowerCase().includes(lowerValue)
    );
  }

  // Fuzzy: value contains the option text (e.g. value='Full-time' matches option '全职 Full-time')
  if (!matched) {
    matched = options.find((opt) => {
      const optText = opt.text.toLowerCase().trim();
      const optValue = opt.value.toLowerCase();
      return (
        (optText.length > 0 && lowerValue.includes(optText)) ||
        (optValue.length > 0 && lowerValue.includes(optValue))
      );
    });
  }

  if (!matched) return false;

  setNativeValue(el, matched.value);
  dispatchEvents(el, ['focus', 'input', 'change', 'blur']);
  return true;
}


/**
 * Fill a radio button by matching label text or value.
 * Looks for all radios with the same name in the same document/form.
 * When no name attribute is present, scopes to the parent container to avoid
 * matching all radios in the document.
 */
async function fillRadio(el: HTMLInputElement, value: string): Promise<boolean> {
  const name = el.getAttribute('name');
  let allRadios: HTMLInputElement[];

  if (name) {
    const root = el.closest('form') ?? el.ownerDocument;
    if (!root) return false;
    allRadios = Array.from(
      root.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${cssEscape(name)}"]`,
      ),
    );
  } else {
    // No name: scope to nearest parent container to avoid matching all radios
    const parent =
      el.parentElement?.closest('div, fieldset, form') ?? el.parentElement;
    allRadios = parent
      ? Array.from(parent.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
      : [];
  }
  if (allRadios.length === 0) return false;

  const lowerValue = value.toLowerCase();

  // Try to match by value attribute first
  let target = allRadios.find(
    (r) => r.value.toLowerCase() === lowerValue
  );

  // Try to match by label text. Survey frameworks (问卷星, etc.) use non-
  // `<label>` elements with `for=id` (e.g. `<div class="label" for="x">男</div>`),
  // so we widen to any element carrying the `for` attribute.
  if (!target) {
    target = allRadios.find((r) => {
      const id = r.getAttribute('id');
      if (id) {
        try {
          const label = r.ownerDocument.querySelector(`[for="${cssEscape(id)}"]`);
          if (label?.textContent?.trim().toLowerCase().includes(lowerValue)) return true;
        } catch { /* fall through */ }
      }
      // Check wrapping label
      const parentLabel = r.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true) as Element;
        clone.querySelectorAll('input').forEach((c) => c.remove());
        const text = clone.textContent?.trim().toLowerCase() ?? '';
        if (text.includes(lowerValue)) return true;
      }
      // Adjacent text nodes / previous siblings
      let sibling: Node | null = r.previousSibling;
      while (sibling) {
        const text = sibling.textContent?.trim().toLowerCase() ?? '';
        if (text && text.includes(lowerValue)) return true;
        sibling = sibling.previousSibling;
      }
      // Next-sibling text nodes (jqradio pattern: input then `<a>` then `<div>label</div>`)
      sibling = r.nextSibling;
      while (sibling) {
        const text = sibling.textContent?.trim().toLowerCase() ?? '';
        if (text && text.includes(lowerValue)) return true;
        sibling = sibling.nextSibling;
      }
      // Parent container's descendant text (ui-radio wrapper pattern)
      const wrapper = r.parentElement?.parentElement;
      if (wrapper) {
        const clone = wrapper.cloneNode(true) as Element;
        clone.querySelectorAll('input, select, textarea').forEach((c) => c.remove());
        const text = clone.textContent?.trim().toLowerCase() ?? '';
        if (text.includes(lowerValue)) return true;
      }
      return false;
    });
  }

  if (!target) return false;

  setNativeChecked(target, true);
  dispatchEvents(target, ['focus', 'input', 'change', 'blur']);
  // Widget libraries that hide the native radio need their proxy clicked.
  if (isVisuallyHidden(target)) {
    const proxy = findVisualProxy(target);
    if (proxy) { try { proxy.click(); } catch { /* ignore */ } }
  }
  return true;
}

/**
 * Fill a checkbox element. Truthy values: 'true', 'yes', '是', '1'.
 */
async function fillCheckbox(el: HTMLInputElement, value: string): Promise<boolean> {
  const truthy = ['true', 'yes', '是', '1'];
  const shouldCheck = truthy.includes(value.toLowerCase().trim());
  const prior = el.checked;
  setNativeChecked(el, shouldCheck);
  dispatchEvents(el, ['focus', 'input', 'change', 'blur']);
  if (isVisuallyHidden(el) && prior !== shouldCheck) {
    const proxy = findVisualProxy(el);
    if (proxy) { try { proxy.click(); } catch { /* ignore */ } }
  }
  return true;
}

/**
 * Fill a date input.
 */
async function fillDate(el: HTMLInputElement, value: string): Promise<boolean> {
  if (el.readOnly || el.disabled) return false;
  setNativeValue(el, value);
  dispatchEvents(el, ['focus', 'input', 'change', 'blur']);
  return el.value === value;
}

/**
 * Fill a contenteditable element (rich-text surfaces, custom comment boxes).
 * Plain-text only — formatting is not preserved across capture/restore.
 */
async function fillContenteditable(el: HTMLElement, value: string): Promise<boolean> {
  el.textContent = value;
  dispatchEvents(el, ['focus', 'input', 'change', 'blur']);
  return (el.textContent ?? '') === value;
}

/**
 * Fill a custom-select (click to open, then find and click matching option in overlay).
 */
async function fillCustomSelect(el: Element, value: string): Promise<boolean> {
  // Click the trigger to open the dropdown
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  // Short delay to allow dropdown to render (some dropdowns are async)
  await new Promise((resolve) => setTimeout(resolve, 50));

  const doc = el.ownerDocument;
  if (!doc) return false;

  const lowerValue = value.toLowerCase();

  // Try common dropdown/listbox selectors
  const overlaySelectors = [
    '[role="listbox"] [role="option"]',
    '[role="option"]',
    '.dropdown-menu li',
    '.dropdown-item',
    '.el-select-dropdown__item',
    '.ant-select-item-option',
    '[class*="option"]',
    '[class*="dropdown"] li',
  ];

  for (const selector of overlaySelectors) {
    const options = Array.from(doc.querySelectorAll(selector));
    if (options.length === 0) continue;

    const match = options.find(
      (opt) =>
        opt.textContent?.trim().toLowerCase() === lowerValue ||
        opt.textContent?.trim().toLowerCase().includes(lowerValue)
    );

    if (match) {
      match.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    }
  }

  return false;
}

/**
 * Main fill dispatcher — routes to the correct filler based on inputType.
 */
export async function fillElement(
  el: Element,
  value: string,
  inputType: InputType
): Promise<boolean> {
  if (!value) return false;

  switch (inputType) {
    case 'text':
      return fillText(el as HTMLInputElement, value);

    case 'textarea':
      return fillText(el as HTMLTextAreaElement, value);

    case 'select':
      return fillSelect(el as HTMLSelectElement, value);

    case 'radio':
      return fillRadio(el as HTMLInputElement, value);

    case 'checkbox':
      return fillCheckbox(el as HTMLInputElement, value);

    case 'date':
      return fillDate(el as HTMLInputElement, value);

    case 'custom-select':
      return fillCustomSelect(el, value);

    case 'contenteditable':
      return fillContenteditable(el as HTMLElement, value);

    default:
      return false;
  }
}

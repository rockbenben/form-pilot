import type { InputType } from '@/lib/engine/adapters/types';
import { findLabelText as captureFindLabelText } from '@/lib/capture/signature';

export interface ElementSignals {
  nameAttr: string | null;
  idAttr: string | null;
  placeholder: string | null;
  labelText: string | null;
  ariaLabel: string | null;
  title: string | null;
  surroundingText: string | null;
  inputType: InputType;
}

/**
 * Detect the InputType from an element's tag name and type attribute.
 */
function detectInputType(el: Element): InputType {
  const tag = el.tagName.toLowerCase();
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'textarea';
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'date' || type === 'datetime-local' || type === 'month') return 'date';
  }
  const ce = el.getAttribute('contenteditable');
  if (ce === 'true' || ce === '' || ce === 'plaintext-only') return 'contenteditable';
  if ((el as HTMLElement).isContentEditable) return 'contenteditable';
  return 'text';
}

/**
 * Delegate to the shared findLabelText in lib/capture/signature — that one
 * handles all the edge cases (any `[for=id]` element, fieldset legend,
 * survey-framework group heading) that arise on non-standard form markup
 * (问卷星, Select2, jqradio, etc.).
 */
function findLabelText(el: Element): string | null {
  const s = captureFindLabelText(el);
  return s.length > 0 ? s : null;
}

/**
 * Extract surrounding text from the previous sibling element or text node.
 */
function findSurroundingText(el: Element): string | null {
  let sibling = el.previousSibling;
  while (sibling) {
    const text = sibling.textContent?.trim();
    if (text) return text;
    sibling = sibling.previousSibling;
  }
  return null;
}

/**
 * Extract all relevant text signals from a form element.
 */
export function extractSignals(el: Element): ElementSignals {
  return {
    nameAttr: el.getAttribute('name'),
    idAttr: el.getAttribute('id'),
    placeholder: el.getAttribute('placeholder'),
    labelText: findLabelText(el),
    ariaLabel: el.getAttribute('aria-label'),
    title: el.getAttribute('title'),
    surroundingText: findSurroundingText(el),
    inputType: detectInputType(el),
  };
}

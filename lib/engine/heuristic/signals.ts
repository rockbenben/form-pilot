import type { InputType } from '@/lib/engine/adapters/types';

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
  return 'text';
}

/**
 * Find label text for an element by:
 * 1. label[for=id]
 * 2. ancestor <label>
 * 3. nearby text (previous sibling)
 */
function findLabelText(el: Element): string | null {
  const id = el.getAttribute('id');
  if (id) {
    const labelEl = el.ownerDocument?.querySelector(`label[for="${id}"]`);
    if (labelEl) {
      return labelEl.textContent?.trim() ?? null;
    }
  }

  // Walk up to find a wrapping <label>
  let parent = el.parentElement;
  while (parent) {
    if (parent.tagName.toLowerCase() === 'label') {
      // Get label text without child input text
      const clone = parent.cloneNode(true) as Element;
      // Remove any nested input/select/textarea elements from clone
      clone.querySelectorAll('input, select, textarea').forEach((child) => child.remove());
      const text = clone.textContent?.trim();
      if (text) return text;
    }
    parent = parent.parentElement;
  }

  return null;
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

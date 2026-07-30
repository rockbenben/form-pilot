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
 * Strip the punctuation sites hang off the end of a label.
 *
 * 智联招聘 renders every label as 「姓名:」「出生年月:」, and required fields are
 * commonly marked 「邮箱 *」. Many entries in PATTERNS are anchored (`^名字$`),
 * so a single trailing colon makes them miss — 「名字」 matches, 「名字:」 does
 * not, and only wordings that happen to have an unanchored sibling pattern
 * survive. Normalising once here fixes every anchored pattern at once.
 *
 * Deliberately NOT applied inside `findLabelText` itself: that function feeds
 * `computeSignatureFor`, and changing its output would invalidate every
 * cross-URL form entry users have already saved.
 */
function normaliseLabel(s: string): string {
  return s.replace(/[\s*＊:：]+$/u, '').replace(/^[\s*＊]+/u, '').trim();
}

/**
 * Delegate to the shared findLabelText in lib/capture/signature — that one
 * handles all the edge cases (any `[for=id]` element, fieldset legend,
 * survey-framework group heading) that arise on non-standard form markup
 * (问卷星, Select2, jqradio, etc.).
 */
function findLabelText(el: Element): string | null {
  const s = normaliseLabel(captureFindLabelText(el));
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

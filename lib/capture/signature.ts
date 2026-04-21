export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function isChoiceInput(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'input') return false;
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  return type === 'radio' || type === 'checkbox';
}

/**
 * For a choice (radio/checkbox) input, `[for=id]` usually points to the
 * *option* label ("男"/"女") — what matters for resume matching is the
 * *question* label ("性别"). Walk up the DOM tree looking for a fieldset's
 * legend or the nearest preceding sibling with short text content (custom
 * survey frameworks like 问卷星 use `<div class="div_title">性别</div>`
 * just before the radio group container).
 */
function findGroupHeading(el: Element): string {
  // Walk starting from el itself — the heading often lives as an immediate
  // previous sibling of the input (`<div class="div_title">年龄</div><input>`).
  let cur: Element | null = el;
  for (let depth = 0; depth < 5 && cur; depth++) {
    // fieldset > legend — structural group marker
    const parentFieldset = cur.parentElement;
    if (parentFieldset?.tagName.toLowerCase() === 'fieldset') {
      const legend = parentFieldset.querySelector(':scope > legend');
      const text = legend?.textContent?.trim();
      if (text) return text;
    }
    let sib = cur.previousElementSibling;
    while (sib) {
      const sibTag = sib.tagName.toLowerCase();
      // Skip form controls themselves
      if (['input', 'select', 'textarea', 'button', 'form', 'script', 'style'].includes(sibTag)) {
        sib = sib.previousElementSibling;
        continue;
      }
      // Skip containers that wrap form controls — a previous radio/checkbox
      // group's option block must not become the current field's "label".
      if (sib.querySelector('input, select, textarea')) {
        sib = sib.previousElementSibling;
        continue;
      }
      const text = (sib as HTMLElement).textContent?.trim();
      if (text && text.length > 0 && text.length <= 200) return text;
      sib = sib.previousElementSibling;
    }
    cur = cur.parentElement;
    if (cur?.tagName.toLowerCase() === 'body') break;
  }
  return '';
}

export function findLabelText(el: Element): string {
  const id = el.getAttribute('id');
  const choice = isChoiceInput(el);

  // For radio/checkbox: the question is what identifies the resume field —
  // prefer the group heading over any per-option [for=id] label.
  if (choice) {
    const group = findGroupHeading(el);
    if (group) return group;
  }

  // Any element (not just `<label>`) with `for=id` — covers survey
  // platforms that render option labels as `<div class="label" for="x">`.
  if (id) {
    try {
      const labelEl = el.ownerDocument?.querySelector(`[for="${CSS.escape(id)}"]`);
      const text = labelEl?.textContent?.trim();
      if (text) return text;
    } catch { /* fall through */ }
  }

  // Wrapping `<label>`
  let p = el.parentElement;
  while (p) {
    if (p.tagName.toLowerCase() === 'label') {
      const clone = p.cloneNode(true) as Element;
      clone.querySelectorAll('input, select, textarea').forEach((c) => c.remove());
      const text = clone.textContent?.trim();
      if (text) return text;
    }
    p = p.parentElement;
  }

  // Preceding sibling `<label>`
  let sibling = el.previousSibling;
  while (sibling) {
    if (sibling.nodeType === 1 && (sibling as Element).tagName.toLowerCase() === 'label') {
      const txt = (sibling as Element).textContent?.trim();
      if (txt) return txt;
    }
    sibling = sibling.previousSibling;
  }

  // Last resort for text inputs too: group heading fallback (a survey
  // question without a proper label).
  if (!choice) {
    const group = findGroupHeading(el);
    if (group) return group;
  }

  return '';
}

/**
 * 3-part signature: labelText | placeholder | aria-label
 *
 * Note: `name` is intentionally NOT included. Two inputs with the same visible
 * identity (label + placeholder + aria) should produce the same signature even
 * if their `name` attributes differ across visits or renders.
 */
export function computeSignatureFor(el: Element): string {
  const labelText = findLabelText(el);
  const placeholder = el.getAttribute('placeholder') ?? '';
  const aria = el.getAttribute('aria-label') ?? '';
  return hashString(`${labelText}|${placeholder}|${aria}`);
}

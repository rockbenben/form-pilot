/**
 * Helpers for dealing with JS libraries that hide the native input
 * (display:none) and render a sibling element (usually <a>, <span>, <div>)
 * as the visible click target. Examples: jqradio, Select2, iCheck, some
 * Ant Design / Element UI widgets.
 *
 * The native input still holds the authoritative value — but setting
 * `.checked` or `.value` + dispatching 'change' doesn't always prompt
 * the widget library to re-paint its UI. Clicking the visible proxy
 * runs the library's own handler, which reads the native state and
 * updates its rendered classes/markup.
 */

/**
 * Treat an element as visually hidden when display:none, visibility:hidden,
 * or it is not part of the rendered layout at all.
 */
export function isVisuallyHidden(el: Element): boolean {
  const htmlEl = el as HTMLElement;
  if (htmlEl.style?.display === 'none' || htmlEl.style?.visibility === 'hidden') return true;
  const win = el.ownerDocument?.defaultView ?? null;
  if (win && typeof win.getComputedStyle === 'function') {
    try {
      const cs = win.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    } catch { /* jsdom edge cases */ }
  }
  return false;
}

const CLICK_PROXY_CLASS_RE = /\b(radio|checkbox|check|toggle|btn|button|chk|switch)\b/i;

/**
 * Heuristic: does this element look like it's meant to be clicked as a
 * widget proxy? `<a>` / `<button>` / `[role="button|radio|checkbox"]` are
 * obvious. Class names containing radio/checkbox/btn also count.
 */
function isClickableProxy(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'a' || tag === 'button') return true;
  const role = el.getAttribute('role');
  if (role === 'button' || role === 'radio' || role === 'checkbox' || role === 'switch') return true;
  const className = typeof el.className === 'string' ? el.className : '';
  if (CLICK_PROXY_CLASS_RE.test(className)) return true;
  return false;
}

/**
 * Find the nearest visible proxy element for a hidden input.
 *
 * Searches, in order:
 *   1. Next-element siblings of the input (jqradio: input then <a>)
 *   2. Previous-element siblings
 *   3. Parent's children other than the input (when input is wrapped)
 *   4. Grandparent's descendants (ui-radio > jqradiowrapper > input + a)
 */
export function findVisualProxy(input: Element): HTMLElement | null {
  const candidates: Element[] = [];

  // 1. Next siblings
  let sib = input.nextElementSibling;
  while (sib) { candidates.push(sib); sib = sib.nextElementSibling; }
  // 2. Previous siblings
  sib = input.previousElementSibling;
  while (sib) { candidates.push(sib); sib = sib.previousElementSibling; }
  // 3. Other parent children
  const parent = input.parentElement;
  if (parent) {
    for (const child of Array.from(parent.children)) {
      if (child === input) continue;
      if (!candidates.includes(child)) candidates.push(child);
    }
    // 4. Grandparent's descendants (widget wrappers often have 2 levels)
    const grandparent = parent.parentElement;
    if (grandparent) {
      for (const desc of Array.from(grandparent.querySelectorAll('a, button, span, div, i'))) {
        if (desc === input || desc === parent) continue;
        if (desc.contains(input)) continue;
        if (!candidates.includes(desc)) candidates.push(desc);
      }
    }
  }

  for (const c of candidates) {
    if (!isClickableProxy(c)) continue;
    if (isVisuallyHidden(c)) continue;
    return c as HTMLElement;
  }
  return null;
}

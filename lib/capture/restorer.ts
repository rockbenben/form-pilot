import type { CapturedField } from './types';
import { computeSignatureFor } from './signature';
import { setNativeValue, setNativeChecked } from './native-set';
import { isVisuallyHidden, findVisualProxy } from './widget-proxy';
import { MULTI_VALUE_SEPARATOR } from './element-value';

export interface RestoreOptions {
  /**
   * Function returning a field's signature from a DOM element.
   * Used only for fallback matching when `selector` fails.
   * Default: re-computes signature via the same algorithm as serializer.
   */
  sigMatcher?: (el: Element) => string;
  /** Tag written to restored elements to prevent auto-fill overwrite. */
  marker?: string;
}

export interface RestoreResult {
  restored: number;
  missing: number;
  /** The DOM elements that were successfully written to. */
  elements: HTMLElement[];
}

function dispatch(el: Element, events: string[]): void {
  for (const name of events) {
    el.dispatchEvent(new Event(name, { bubbles: true, cancelable: true }));
  }
}

interface SignatureIndex {
  /** Lazily-built grouping of all inputs keyed by signature, DOM order preserved. */
  groups: Map<string, Element[]> | null;
  build(): Map<string, Element[]>;
}

function createSignatureIndex(doc: Document, sigMatcher: (el: Element) => string): SignatureIndex {
  return {
    groups: null,
    build() {
      if (this.groups) return this.groups;
      const map = new Map<string, Element[]>();
      const all = doc.querySelectorAll('input, textarea, select');
      for (const el of all) {
        const sig = sigMatcher(el);
        const arr = map.get(sig) ?? [];
        arr.push(el);
        map.set(sig, arr);
      }
      this.groups = map;
      return map;
    },
  };
}

function resolveTarget(
  doc: Document,
  field: CapturedField,
  index: SignatureIndex,
): Element | null {
  try {
    const matched = doc.querySelectorAll(field.selector);
    if (matched.length === 1) return matched[0];
  } catch { /* invalid selector → fall through */ }
  if (!field.signature) return null;
  const group = index.build().get(field.signature);
  return group?.[field.index] ?? null;
}

export function restoreFields(
  doc: Document,
  fields: CapturedField[],
  opts: RestoreOptions = {},
): RestoreResult {
  const sigMatcher = opts.sigMatcher ?? computeSignatureFor;
  const marker = opts.marker ?? 'draft';
  const sigIndex = createSignatureIndex(doc, sigMatcher);
  let restored = 0, missing = 0;
  const elements: HTMLElement[] = [];

  for (const f of fields) {
    const el = resolveTarget(doc, f, sigIndex);
    if (!el) { missing++; continue; }

    const targetEl = restoreOne(el, f);
    if (!targetEl) { missing++; continue; }

    targetEl.setAttribute('data-formpilot-restored', marker);
    elements.push(targetEl);
    restored++;
  }

  return { restored, missing, elements };
}

/**
 * Apply a captured value to the resolved target. Returns the element that
 * actually received the write (may differ from `el` when a radio-group
 * fallback had to pick a different member by value).
 */
function restoreOne(el: Element, f: CapturedField): HTMLElement | null {
  switch (f.kind) {
    case 'text':
    case 'textarea':
    case 'date':
      setNativeValue(el as HTMLInputElement | HTMLTextAreaElement, f.value);
      dispatch(el, ['focus', 'input', 'change', 'blur']);
      return el as HTMLElement;

    case 'select':
      return restoreSelect(el as HTMLSelectElement, f.value);

    case 'radio':
      return restoreRadio(el as HTMLInputElement, f.value);

    case 'checkbox': {
      const c = el as HTMLInputElement;
      const want = f.value === 'true';
      const prior = c.checked;
      setNativeChecked(c, want);
      dispatch(c, ['focus', 'input', 'change', 'blur']);
      // Visible proxy sync (iCheck / custom toggle libraries hide the
      // native checkbox; clicking it directly does nothing for the user UI)
      if (isVisuallyHidden(c) && prior !== want) {
        const proxy = findVisualProxy(c);
        if (proxy) { try { proxy.click(); } catch { /* ignore */ } }
      }
      return c;
    }
    case 'contenteditable': {
      const h = el as HTMLElement;
      h.textContent = f.value;
      dispatch(h, ['focus', 'input', 'change', 'blur']);
      return h;
    }
  }
}

/**
 * Try exact value match first, then fuzzy option-text match.
 * Mirrors fillers.ts::fillSelect logic so restore survives minor option
 * text/value drift between capture and restore.
 */
function restoreSelect(el: HTMLSelectElement, value: string): HTMLElement | null {
  // Multi-select: value is unit-separator-joined; restore by toggling every
  // option whose value or text appears in the stored set.
  if (el.multiple) {
    const parts = value.split(MULTI_VALUE_SEPARATOR).filter((s) => s.length > 0);
    const wanted = new Set(parts.map((s) => s.toLowerCase()));
    for (const opt of Array.from(el.options)) {
      const match =
        wanted.has(opt.value.toLowerCase()) ||
        wanted.has(opt.text.trim().toLowerCase());
      opt.selected = match;
    }
    dispatch(el, ['focus', 'input', 'change', 'blur']);
    return el;
  }

  const lower = value.toLowerCase();
  let matched = Array.from(el.options).find(
    (o) => o.value === value || o.text.trim() === value,
  );
  if (!matched) {
    matched = Array.from(el.options).find(
      (o) =>
        o.text.toLowerCase().includes(lower) ||
        o.value.toLowerCase().includes(lower),
    );
  }
  if (!matched) {
    setNativeValue(el, value);
    dispatch(el, ['focus', 'input', 'change', 'blur']);
    return el;
  }
  setNativeValue(el, matched.value);
  dispatch(el, ['focus', 'input', 'change', 'blur']);
  return el;
}

/**
 * If the resolved radio's own `value` matches, check it. Otherwise walk the
 * whole radio group (by `name`) and pick the one whose value matches.
 * Covers the case where selector/signature fallback landed on a different
 * member of the same group than the originally-checked radio.
 */
function restoreRadio(el: HTMLInputElement, value: string): HTMLElement | null {
  // Locate the specific radio in the group whose value matches.
  let target: HTMLInputElement | null = null;
  if (el.value === value) {
    target = el;
  } else {
    const name = el.getAttribute('name');
    if (name) {
      const root = el.closest('form') ?? el.ownerDocument;
      if (root) {
        const siblings = Array.from(
          root.querySelectorAll<HTMLInputElement>(
            `input[type="radio"][name="${name.replace(/"/g, '\\"')}"]`,
          ),
        );
        target = siblings.find((r) => r.value === value) ?? null;
      }
    }
  }

  if (!target) {
    setNativeChecked(el, false);
    dispatch(el, ['focus', 'input', 'change', 'blur']);
    return el;
  }

  setNativeChecked(target, true);
  dispatch(target, ['focus', 'input', 'change', 'blur']);

  // Library-controlled hidden radios (jqradio, iCheck, Element UI, etc.)
  // don't repaint from programmatic `checked` changes. Click the visible
  // proxy element so the library's own click handler syncs its UI.
  if (isVisuallyHidden(target)) {
    const proxy = findVisualProxy(target);
    if (proxy) { try { proxy.click(); } catch { /* ignore */ } }
  }
  return target;
}

import type { CapturedField, CapturedFieldKind } from './types';
import { isSensitiveLabel, MAX_FIELD_SIZE, MAX_TOTAL_SIZE } from './sensitive';
import { computeSignatureFor, findLabelText } from './signature';
import { cssEscape } from './css-escape';
import { detectElementKind, readElementValue as readVal, MULTI_VALUE_SEPARATOR } from './element-value';

/**
 * For radio/select, capture the user-visible option text (what the user
 * actually *saw* and picked). Internal values ("1", "male", "han") vary
 * across sites rendering the same question — the visible text is what
 * makes cross-URL form-entry matching work.
 */
function readDisplayValue(el: Element, kind: CapturedFieldKind): string | undefined {
  if (kind === 'radio') {
    const r = el as HTMLInputElement;
    if (!r.checked) return undefined;
    const id = r.getAttribute('id');
    if (id) {
      try {
        const labelEl = r.ownerDocument?.querySelector(`[for="${cssEscape(id)}"]`);
        const t = labelEl?.textContent?.trim();
        if (t) return t;
      } catch { /* fall through */ }
    }
    const wrap = r.closest('label');
    if (wrap) {
      const clone = wrap.cloneNode(true) as Element;
      clone.querySelectorAll('input, select, textarea').forEach((c) => c.remove());
      const t = clone.textContent?.trim();
      if (t) return t;
    }
    // jqradio-like: the option label div sits later in the same wrapper.
    const parent = r.parentElement?.parentElement;
    if (parent) {
      const forLabel = parent.querySelector(`[for="${id ? cssEscape(id) : ''}"]`);
      const t = forLabel?.textContent?.trim();
      if (t) return t;
    }
    return r.value;
  }
  if (kind === 'select') {
    const s = el as HTMLSelectElement;
    if (s.multiple) {
      const texts: string[] = [];
      for (const opt of Array.from(s.options)) {
        if (opt.selected) texts.push(opt.text.trim() || opt.value);
      }
      return texts.join(MULTI_VALUE_SEPARATOR);
    }
    const opt = s.options[s.selectedIndex];
    const t = opt?.text?.trim();
    return t || s.value;
  }
  return undefined;
}

export interface SerializeOptions {
  skipSensitive: boolean;
}

export interface SerializeResult {
  fields: CapturedField[];
  /** Count of inputs skipped due to sensitive/size filters. */
  skipped: number;
}

const SKIPPED_INPUT_TYPES = new Set([
  'hidden', 'submit', 'reset', 'button', 'image', 'password', 'file',
]);

function buildSelector(el: Element): string {
  const id = el.getAttribute('id');
  if (id) return `#${cssEscape(id)}`;
  const tag = el.tagName.toLowerCase();
  const type = el.getAttribute('type');
  const base = type ? `${tag}[type="${type}"]` : tag;
  const all = Array.from(
    el.ownerDocument!.querySelectorAll(
      type ? `${tag}[type="${cssEscape(type)}"]` : tag,
    ),
  );
  const n = all.indexOf(el) + 1;
  return `${base}:nth-of-type(${n})`;
}

export function serializeFields(
  doc: Document,
  opts: SerializeOptions,
): SerializeResult {
  // Include contenteditable surfaces so rich-text / custom comment editors
  // round-trip through capture and restore. The filter rejects ancestor
  // contenteditable-inherited children that query-match but aren't the
  // editable root.
  const inputs = Array.from(
    doc.querySelectorAll<HTMLElement>('input, textarea, select, [contenteditable]'),
  ).filter((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    const ce = el.getAttribute('contenteditable');
    if (ce === 'true' || ce === '' || ce === 'plaintext-only') return true;
    return el.isContentEditable;
  });
  let skipped = 0;

  // Pre-filter radios: keep only the checked one per (name) group.
  const radiosByName = new Map<string, HTMLInputElement>();
  const skippedRadios = new Set<Element>();
  for (const el of inputs) {
    if (
      el.tagName.toLowerCase() === 'input'
      && (el.getAttribute('type') ?? '').toLowerCase() === 'radio'
    ) {
      const name = el.getAttribute('name') ?? '';
      if (!name) continue;
      const existing = radiosByName.get(name);
      const r = el as HTMLInputElement;
      if (r.checked) radiosByName.set(name, r);
      else if (!existing) skippedRadios.add(r);
    }
  }
  // Any radio in a group that has a checked sibling chosen becomes skipped.
  for (const el of inputs) {
    if (
      el.tagName.toLowerCase() === 'input'
      && (el.getAttribute('type') ?? '').toLowerCase() === 'radio'
    ) {
      const name = el.getAttribute('name') ?? '';
      if (!name) continue;
      const keep = radiosByName.get(name);
      if (keep && keep !== el) skippedRadios.add(el);
      if (!keep) skippedRadios.add(el); // no checked in group → skip all
    }
  }

  const preliminary: CapturedField[] = [];
  const signatureIndex = new Map<string, number>();

  for (const el of inputs) {
    // Tag-level filter:
    if (el.tagName.toLowerCase() === 'input') {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (SKIPPED_INPUT_TYPES.has(type)) { continue; }
    }

    const kind = detectElementKind(el);
    if (!kind) continue;

    // Disabled-only gate. `readOnly` is intentionally allowed: survey
    // frameworks ship widgets (datepickers, masked inputs) that set the
    // underlying native input to readonly and mutate its value via JS. We
    // want those values captured. Purely display-only readonly inputs are
    // rare in forms and capturing them is harmless.
    const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (inputEl.disabled) continue;

    // Radio group reduction:
    if (kind === 'radio' && skippedRadios.has(el)) continue;

    const labelText = findLabelText(el);
    const name = el.getAttribute('name') ?? '';
    const placeholder = el.getAttribute('placeholder') ?? '';
    const aria = el.getAttribute('aria-label') ?? '';

    if (opts.skipSensitive) {
      const blob = `${labelText} ${name} ${placeholder} ${aria}`;
      if (isSensitiveLabel(blob)) { skipped++; continue; }
    }

    const value = readVal(el);
    if (value.length > MAX_FIELD_SIZE) { skipped++; continue; }

    const signature = computeSignatureFor(el);
    const idx = signatureIndex.get(signature) ?? 0;
    signatureIndex.set(signature, idx + 1);

    preliminary.push({
      selector: buildSelector(el),
      index: idx,
      kind,
      value,
      displayValue: readDisplayValue(el, kind),
      signature,
      label: labelText || aria || placeholder || name,
    });
  }

  // Enforce total-size budget by dropping largest fields first.
  let totalSize = preliminary.reduce((sum, f) => sum + f.value.length, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    const indices = preliminary
      .map((f, i) => ({ i, len: f.value.length }))
      .sort((a, b) => b.len - a.len);
    const dropped = new Set<number>();
    for (const { i, len } of indices) {
      if (totalSize <= MAX_TOTAL_SIZE) break;
      dropped.add(i);
      totalSize -= len;
      skipped++;
    }
    return {
      fields: preliminary.filter((_, i) => !dropped.has(i)),
      skipped,
    };
  }

  return { fields: preliminary, skipped };
}

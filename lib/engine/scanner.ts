import type { PlatformAdapter, FillSource, InputType } from './adapters/types';
import { matchField } from './heuristic/engine';

export type ScannedStatus = 'recognized' | 'unrecognized';

export interface ScannedItem {
  element: Element;
  resumePath: string;
  label: string;
  inputType: InputType;
  confidence: number;
  source: FillSource;
  status: ScannedStatus;
}

/**
 * Identify fields on a page. Does NOT fill or mutate DOM values.
 * Runs adapter + heuristic cascade, identical to orchestrateFill's Phase 1+2,
 * but returns recognized/unrecognized items without applying values.
 */
export async function scanFields(
  doc: Document,
  adapter: PlatformAdapter | null,
): Promise<ScannedItem[]> {
  const items: ScannedItem[] = [];
  const handled = new Set<Element>();

  if (adapter) {
    let mappings: ReturnType<typeof adapter.scan> = [];
    try {
      mappings = adapter.scan(doc);
    } catch {
      // Buggy adapter — fall back to heuristic-only for this page.
      mappings = [];
    }
    for (const m of mappings) {
      handled.add(m.element);
      items.push({
        element: m.element,
        resumePath: m.resumePath,
        label: m.label,
        inputType: m.inputType,
        confidence: m.confidence,
        source: 'adapter',
        status: m.resumePath ? 'recognized' : 'unrecognized',
      });
    }
  }

  const inputs = Array.from(
    doc.querySelectorAll<HTMLElement>('input, select, textarea, [contenteditable]'),
  ).filter((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    const ce = el.getAttribute('contenteditable');
    if (ce === 'true' || ce === '' || ce === 'plaintext-only') return true;
    return el.isContentEditable;
  });
  for (const el of inputs) {
    if (handled.has(el)) continue;
    if (el.tagName.toLowerCase() === 'input') {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (['hidden', 'submit', 'reset', 'button', 'image'].includes(type)) continue;
    }
    let m: ReturnType<typeof matchField> = null;
    try {
      m = matchField(el);
    } catch {
      // Detached or weird DOM — treat as unrecognized.
      m = null;
    }
    if (!m || m.confidence < 0.5) {
      const label =
        el.getAttribute('aria-label') ??
        el.getAttribute('placeholder') ??
        el.getAttribute('name') ??
        el.getAttribute('id') ??
        '';
      items.push({
        element: el,
        resumePath: '',
        label,
        inputType: m?.inputType ?? 'text',
        confidence: m?.confidence ?? 0,
        source: 'heuristic',
        status: 'unrecognized',
      });
      continue;
    }
    items.push({
      element: el,
      resumePath: m.resumePath,
      label: m.label,
      inputType: m.inputType,
      confidence: m.confidence,
      source: 'heuristic',
      status: 'recognized',
    });
  }
  return items;
}

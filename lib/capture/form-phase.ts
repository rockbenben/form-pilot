import type { FormEntry } from '@/lib/storage/form-store';
import type { ScannedItem } from '@/lib/engine/scanner';
import type { InputType } from '@/lib/engine/adapters/types';
import { computeSignatureFor } from './signature';
import { detectElementKind } from './element-value';
import { fillElement } from '@/lib/engine/heuristic/fillers';

/**
 * Phase 4 — cross-URL form entries. After adapter, heuristic+resume, and
 * per-URL page memory have all passed, any still-unrecognized field whose
 * signature appears in the cross-URL form store gets filled with the
 * remembered display value.
 *
 * Mutates matched ScannedItems: status → 'recognized', source → 'form'.
 * Returns the count filled.
 */
export async function runFormPhase(
  doc: Document,
  items: ScannedItem[],
  entries: Record<string, FormEntry>,
): Promise<number> {
  const signatures = Object.keys(entries);
  if (signatures.length === 0) return 0;

  // A radio group is exposed as N scanned items (one per DOM input) but
  // logically represents one field — dedupe by `name` so the same group
  // isn't re-filled per-member.
  const radioGroupsDone = new Set<string>();

  let filled = 0;
  for (const it of items) {
    if (it.status !== 'unrecognized') continue;
    if ((it.element as HTMLElement).getAttribute?.('data-formpilot-restored') === 'draft') continue;

    const kind = detectElementKind(it.element);
    if (kind === 'radio') {
      const name = (it.element as HTMLInputElement).getAttribute('name') ?? '';
      if (name && radioGroupsDone.has(name)) continue;
    }

    const sig = computeSignatureFor(it.element);
    const entry = entries[sig];
    if (!entry) continue;

    const fillValue = entry.displayValue && entry.displayValue.length > 0
      ? entry.displayValue
      : entry.value;
    if (!fillValue) continue;

    const inputType: InputType = kind ?? entry.kind;
    try {
      const ok = await fillElement(it.element, fillValue, inputType);
      if (ok) {
        it.status = 'recognized';
        it.source = 'form';
        it.resumePath = '(form)';
        filled++;
        if (kind === 'radio') {
          const name = (it.element as HTMLInputElement).getAttribute('name') ?? '';
          if (name) radioGroupsDone.add(name);
        }
      }
    } catch { /* ignore */ }
  }
  return filled;
}

// lib/capture/memory-phase.ts
import type { PageMemoryEntry } from './types';
import type { ScannedItem } from '@/lib/engine/scanner';
import { computeSignatureFor } from './signature';
import { detectElementKind } from './element-value';
import { fillElement } from '@/lib/engine/heuristic/fillers';

/**
 * For each unrecognized scanned item, try to match it against `entries` by
 * (signature, per-signature DOM-order index). On match, fill the element and
 * mutate the ScannedItem to status='recognized', source='memory',
 * resumePath='(memory)'.
 *
 * Returns the count of elements filled from memory.
 */
export async function runMemoryPhase(
  doc: Document,
  items: ScannedItem[],
  entries: PageMemoryEntry[],
): Promise<number> {
  if (entries.length === 0) return 0;

  // Group unrecognized items by signature, preserving DOM order.
  // Skip elements flagged by draft restore so memory does not clobber the
  // user's saved draft values.
  const unrecognizedBySignature = new Map<string, ScannedItem[]>();
  for (const it of items) {
    if (it.status !== 'unrecognized') continue;
    if ((it.element as HTMLElement).getAttribute?.('data-formpilot-restored') === 'draft') continue;
    const sig = computeSignatureFor(it.element);
    const arr = unrecognizedBySignature.get(sig) ?? [];
    arr.push(it);
    unrecognizedBySignature.set(sig, arr);
  }

  let filled = 0;
  for (const entry of entries) {
    const group = unrecognizedBySignature.get(entry.signature);
    if (!group) continue;
    const target = group[entry.index];
    if (!target) continue;
    // CapturedFieldKind is a subset of InputType, so direct use is type-safe.
    const inputType = detectElementKind(target.element) ?? entry.kind;
    try {
      const ok = await fillElement(target.element, entry.value, inputType);
      if (ok) {
        target.status = 'recognized';
        target.source = 'memory';
        target.resumePath = '(memory)';
        filled++;
      }
    } catch { /* ignore */ }
  }
  return filled;
}

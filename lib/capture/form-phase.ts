import type { FormEntriesMap } from '@/lib/storage/form-store';
import type { ScannedItem } from '@/lib/engine/scanner';
import type { InputType } from '@/lib/engine/adapters/types';
import type { FieldDomainPrefs } from '@/lib/storage/domain-prefs-store';
import { resolveCandidate } from '@/lib/storage/form-store';
import { computeSignatureFor } from './signature';
import { detectElementKind } from './element-value';
import { fillElement } from '@/lib/engine/heuristic/fillers';

export interface FormPhaseFill {
  signature: string;
  candidateId: string;
}

export interface FormPhaseResult {
  filled: number;
  hits: FormPhaseFill[];
}

/**
 * Phase 4 — cross-URL form entries.
 *
 * For each unrecognized scanned item, resolves a candidate via
 * `resolveCandidate(entry, currentDomain, domainPrefs[sig])` and fills it.
 * Emits (signature, candidateId) pairs so the caller can bump hitCount.
 */
export async function runFormPhase(
  doc: Document,
  items: ScannedItem[],
  entries: FormEntriesMap,
  domainPrefs: FieldDomainPrefs,
  currentDomain: string,
): Promise<FormPhaseResult> {
  const hits: FormPhaseFill[] = [];
  if (Object.keys(entries).length === 0) return { filled: 0, hits };

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

    const candidate = resolveCandidate(entry.candidates, entry.pinnedId, currentDomain, domainPrefs[sig] ?? {});
    if (!candidate) continue;

    const fillValue = candidate.displayValue && candidate.displayValue.length > 0
      ? candidate.displayValue
      : candidate.value;
    if (!fillValue) continue;

    const inputType: InputType = kind ?? entry.kind;
    try {
      const ok = await fillElement(it.element, fillValue, inputType);
      if (ok) {
        it.status = 'recognized';
        it.source = 'form';
        it.resumePath = '(form)';
        filled++;
        hits.push({ signature: sig, candidateId: candidate.id });
        if (kind === 'radio') {
          const name = (it.element as HTMLInputElement).getAttribute('name') ?? '';
          if (name) radioGroupsDone.add(name);
        }
      }
    } catch { /* ignore */ }
  }
  return { filled, hits };
}

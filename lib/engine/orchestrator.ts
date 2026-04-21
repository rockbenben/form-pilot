import type { PlatformAdapter, FillResult, FillResultItem } from './adapters/types';
import type { Resume } from '@/lib/storage/types';
import { scanFields } from './scanner';
import { fillElement } from './heuristic/fillers';
import { runMemoryPhase } from '@/lib/capture/memory-phase';
import { runFormPhase } from '@/lib/capture/form-phase';
import type { PageMemoryEntry } from '@/lib/capture/types';
import type { FormEntry } from '@/lib/storage/form-store';
import type { FieldDomainPrefs } from '@/lib/storage/domain-prefs-store';

// ─── Resume Path Resolver ─────────────────────────────────────────────────────

/**
 * Resolve a dotted resume path to a string value.
 *
 * - 'basic.name'              → resume.basic.name
 * - 'education.school'        → resume.education[0].school (first entry)
 * - 'education[1].school'     → resume.education[1].school (explicit index)
 * - 'work.company'            → resume.work[0].company
 * - 'basic.socialLinks.github'→ resume.basic.socialLinks['github']
 * - Array values are joined with ', '
 */
export function getValueFromResume(resume: Resume, path: string): string {
  const indexMatch = path.match(/^(\w+)\[(\d+)\]\.(.+)$/);
  if (indexMatch) {
    const [, section, indexStr, field] = indexMatch;
    const arr = resume[section as keyof Resume];
    if (Array.isArray(arr)) {
      const entry = arr[parseInt(indexStr, 10)];
      if (entry) return String((entry as Record<string, unknown>)[field] ?? '');
    }
    return '';
  }
  const parts = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = resume;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return '';
    if (Array.isArray(cursor)) {
      if (cursor.length === 0) return '';
      cursor = cursor[0];
    }
    cursor = cursor[part];
  }
  if (cursor === null || cursor === undefined) return '';
  if (Array.isArray(cursor)) {
    // FieldCandidate[] (Phase B): resolve to first candidate's value.
    // Task 7 will replace this with proper pinnedId / hitCount resolution.
    if (cursor.length > 0 && typeof cursor[0] === 'object' && cursor[0] !== null && 'value' in cursor[0]) {
      return String((cursor[0] as { value: unknown }).value ?? '');
    }
    return cursor.join(', ');
  }
  return String(cursor);
}

/**
 * Fill a document's form fields using the cascade strategy:
 *   Phase 1 (adapter) + Phase 2 (heuristic) — via scanFields
 *   Phase 3 (page memory) — fallback for still-unrecognized fields
 */
export async function orchestrateFill(
  doc: Document,
  resume: Resume,
  adapter: PlatformAdapter | null,
  memoryEntries: PageMemoryEntry[] = [],
  formEntries: Record<string, FormEntry> = {},
  domainPrefs: FieldDomainPrefs = {},
  currentDomain: string = '',
): Promise<FillResult> {
  const scanned = await scanFields(doc, adapter);
  const items: FillResultItem[] = [];

  for (const s of scanned) {
    if ((s.element as HTMLElement).getAttribute?.('data-formpilot-restored') === 'draft') continue;

    if (s.status === 'unrecognized' || !s.resumePath) {
      items.push({
        element: s.element,
        resumePath: '',
        label: s.label,
        status: 'unrecognized',
        confidence: s.confidence,
        source: s.source,
      });
      continue;
    }

    const value = getValueFromResume(resume, s.resumePath);
    let filled = false;
    if (value) {
      try {
        if (s.source === 'adapter' && adapter) {
          filled = await adapter.fill(s.element, value, s.inputType);
        } else {
          filled = await fillElement(s.element, value, s.inputType);
        }
      } catch { filled = false; }
    }

    let status: FillResultItem['status'];
    if (!filled) status = 'unrecognized';
    else if (s.source === 'adapter' || s.confidence >= 0.8) status = 'filled';
    else status = 'uncertain';

    items.push({
      element: s.element,
      resumePath: s.resumePath,
      label: s.label,
      status,
      confidence: s.confidence,
      source: s.source,
    });
  }

  // Phase 3 — page memory fallback for still-unrecognized items.
  if (memoryEntries.length > 0) {
    const memoryFilled = await runMemoryPhase(doc, scanned, memoryEntries);
    if (memoryFilled > 0) {
      const byElement = new Map(items.map((it) => [it.element, it] as const));
      for (const s of scanned) {
        if (s.source !== 'memory') continue;
        const it = byElement.get(s.element);
        if (!it) continue;
        it.status = 'filled';
        it.source = 'memory';
        it.resumePath = '(memory)';
        it.confidence = 1.0;
      }
    }
  }

  // Phase 4 — cross-URL form entries.
  let formHits: Array<{ signature: string; candidateId: string }> | undefined;
  if (Object.keys(formEntries).length > 0) {
    const { filled: formFilled, hits } = await runFormPhase(
      doc, scanned, formEntries, domainPrefs, currentDomain,
    );
    if (hits.length > 0) formHits = hits;
    if (formFilled > 0) {
      const byElement = new Map(items.map((it) => [it.element, it] as const));
      for (const s of scanned) {
        if (s.source !== 'form') continue;
        const it = byElement.get(s.element);
        if (!it) continue;
        it.status = 'filled';
        it.source = 'form';
        it.resumePath = '(form)';
        it.confidence = 0.75;
      }
    }
  }

  const filled = items.filter((i) => i.status === 'filled').length;
  const uncertain = items.filter((i) => i.status === 'uncertain').length;
  const unrecognized = items.filter((i) => i.status === 'unrecognized').length;
  return { items, filled, uncertain, unrecognized, formHits };
}

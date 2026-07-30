import type { PlatformAdapter, FillResult, FillResultItem } from './adapters/types';
import type { Resume } from '@/lib/storage/types';
import { scanFields } from './scanner';
import { fillElement } from './heuristic/fillers';
import { runMemoryPhase } from '@/lib/capture/memory-phase';
import { runFormPhase } from '@/lib/capture/form-phase';
import type { PageMemoryEntry } from '@/lib/capture/types';
import type { FormEntry } from '@/lib/storage/form-store';
import type { FieldDomainPrefs } from '@/lib/storage/domain-prefs-store';
import { resolveCandidate } from '@/lib/capture/candidate';
import { isPresent, renderPresent } from '@/lib/present-date';

// ─── Resume Path Resolver ─────────────────────────────────────────────────────

/**
 * Resolve a dotted resume path to a string value.
 *
 * basic.phone / basic.email route through resolveCandidate — using
 * currentDomain and the active resume's profileDomainPrefs, a candidate is
 * picked (domain pref > pin > hitCount > updatedAt > createdAt). Other paths
 * resolve with the legacy dotted walk.
 *
 * When a profile candidate is picked, `onProfilePick` is invoked with the
 * (resumePath, candidateId) so the caller can bump hitCount after fill.
 *
 * - 'basic.name'              → resume.basic.name
 * - 'basic.phone'             → resolved candidate's value (or '' if empty)
 * - 'basic.email'             → resolved candidate's value (or '' if empty)
 * - 'education.school'        → resume.education[0].school (first entry)
 * - 'education[1].school'     → resume.education[1].school (explicit index)
 * - 'basic.socialLinks.github'→ resume.basic.socialLinks['github']
 * - Array-of-string values are joined with ', '
 */
export function getValueFromResume(
  resume: Resume,
  path: string,
  currentDomain: string = '',
  profileDomainPrefs: Record<string, Record<string, string>> = {},
  onProfilePick?: (resumePath: string, candidateId: string) => void,
): string {
  // Phase B: profile multi-value dispatch.
  if (path === 'basic.phone') {
    const picked = resolveCandidate(
      resume.basic.phone,
      resume.basic.phonePinnedId,
      currentDomain,
      profileDomainPrefs['basic.phone'] ?? {},
    );
    if (picked && onProfilePick) onProfilePick(path, picked.id);
    return picked?.value ?? '';
  }
  if (path === 'basic.email') {
    const picked = resolveCandidate(
      resume.basic.email,
      resume.basic.emailPinnedId,
      currentDomain,
      profileDomainPrefs['basic.email'] ?? {},
    );
    if (picked && onProfilePick) onProfilePick(path, picked.id);
    return picked?.value ?? '';
  }

  // Legacy dotted-path resolver.
  const indexMatch = path.match(/^(\w+)\[(\d+)\]\.(.+)$/);
  if (indexMatch) {
    const [, section, indexStr, field] = indexMatch;
    const arr = resume[section as keyof Resume];
    if (Array.isArray(arr)) {
      const entry = arr[parseInt(indexStr, 10)];
      if (entry) return String((entry as unknown as Record<string, unknown>)[field] ?? '');
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
  if (Array.isArray(cursor)) return cursor.join(', ');
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
  profileDomainPrefs: Record<string, Record<string, string>> = {},
): Promise<FillResult> {
  const scanned = await scanFields(doc, adapter);
  const items: FillResultItem[] = [];
  const profileHits: Array<{ resumePath: string; candidateId: string }> = [];

  // Long-form answers are written once, however many boxes ask for one.
  //
  // 猎聘 gives a project three separate textareas — 项目描述, 项目职责, 项目业绩 —
  // and a job two. Résumé has one description per entry, so all of them resolve
  // to the same path and every box received the same paragraph. A recruiter sees
  // one answer pasted three times, and the user cannot tell it happened because
  // each field looks filled. Reporting the later boxes as 「待补」 says what is
  // actually true: these ask different questions and the profile answers one.
  //
  // Scoped to prose. Repeating a phone number or a city across the several
  // places a form asks for it is correct, and must keep working.
  const prosePathsSeen = new Set<string>();
  const isProse = (path: string) => /\.description$/.test(path) || path === 'basic.summary';

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

    // Collect the picked profile candidate (if any) but don't record it as a hit
    // until after fill succeeds — otherwise read-only / wrong-widget / draft-gated
    // fields would inflate hitCount for fills that never happened.
    let pickedProfile: { resumePath: string; candidateId: string } | null = null;
    const raw = getValueFromResume(
      resume,
      s.resumePath,
      currentDomain,
      profileDomainPrefs,
      (path, candidateId) => { pickedProfile = { resumePath: path, candidateId }; },
    );
    // A still-current job stores the PRESENT sentinel, which is not a date and
    // must never reach a form as the literal string "present".
    let value = isPresent(raw) ? renderPresent(doc) : raw;
    if (value && isProse(s.resumePath)) {
      if (prosePathsSeen.has(s.resumePath)) value = '';
      else prosePathsSeen.add(s.resumePath);
    }
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
    if (filled && pickedProfile) profileHits.push(pickedProfile);

    // An empty `value` means the field matched a resume path but the profile
    // has nothing stored there — the user's fix is to complete their profile,
    // which is a different message from "this field could not be matched".
    // Reporting both as `unrecognized` made a blank profile indistinguishable
    // from a broken matcher.
    let status: FillResultItem['status'];
    if (filled) status = s.source === 'adapter' || s.confidence >= 0.8 ? 'filled' : 'uncertain';
    else if (!value) status = 'empty';
    else status = 'unrecognized';

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
  const empty = items.filter((i) => i.status === 'empty').length;
  const unrecognized = items.filter((i) => i.status === 'unrecognized').length;
  return {
    items,
    filled,
    uncertain,
    empty,
    unrecognized,
    formHits,
    profileHits: profileHits.length > 0 ? profileHits : undefined,
  };
}

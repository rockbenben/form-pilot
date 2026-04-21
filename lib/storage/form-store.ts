import type { CapturedField, CapturedFieldKind } from '@/lib/capture/types';
import {
  WEAK_CANDIDATE_AGE_MS,
  WEAK_CANDIDATE_HIT_THRESHOLD,
} from '@/lib/capture/constants';
import { clearPrefsPointingToCandidate, clearDomainPrefsForSignature, clearAllFieldDomainPrefs } from './domain-prefs-store';

const KEY = 'formpilot:formEntries';

/** One saved alternate for a signature. */
export interface FieldCandidate {
  id: string;
  value: string;
  displayValue?: string;
  hitCount: number;
  createdAt: number;
  updatedAt: number;
  lastUrl: string;
}

/** Cross-URL record for one signature. */
export interface FormEntry {
  signature: string;
  kind: CapturedFieldKind;
  label: string;
  candidates: FieldCandidate[];
  pinnedId: string | null;
}

export type FormEntriesMap = Record<string, FormEntry>;

async function readAll(): Promise<FormEntriesMap> {
  const res = await chrome.storage.local.get(KEY);
  return (res[KEY] as FormEntriesMap | undefined) ?? {};
}

async function writeAll(all: FormEntriesMap): Promise<void> {
  await chrome.storage.local.set({ [KEY]: all });
}

function candidateMatches(c: FieldCandidate, value: string, displayValue?: string): boolean {
  return c.value === value && (c.displayValue ?? '') === (displayValue ?? '');
}

/** Construct a fresh FieldCandidate. Callers pass `hitCount: 0` for manually-added candidates; `1` for real saves. */
function newCandidate(
  value: string,
  displayValue: string | undefined,
  lastUrl: string,
  now: number,
  hitCount: number,
): FieldCandidate {
  return {
    id: crypto.randomUUID(),
    value,
    displayValue,
    hitCount,
    createdAt: now,
    updatedAt: now,
    lastUrl,
  };
}

/**
 * Upsert form entries from a captured snapshot.
 *
 *  - Dedupes by signature within a single save (one save = one hit).
 *  - Matching (value, displayValue) bumps an existing candidate.
 *  - Differing value appends a new candidate.
 *  - Checkbox signatures are special: always single-candidate;
 *    flipping the stored value resets hitCount.
 */
export async function saveFormEntries(
  fields: CapturedField[],
  sourceUrl: string,
): Promise<number> {
  if (fields.length === 0) return 0;

  const bySignature = new Map<string, CapturedField>();
  for (const f of fields) {
    if (!f.signature) continue;
    if (!f.value && !f.displayValue) continue;
    bySignature.set(f.signature, f);
  }
  if (bySignature.size === 0) return 0;

  const all = await readAll();
  const now = Date.now();
  let saved = 0;

  for (const [sig, f] of bySignature) {
    const entry = all[sig];
    if (!entry) {
      all[sig] = {
        signature: sig,
        kind: f.kind,
        label: f.label,
        candidates: [newCandidate(f.value, f.displayValue, sourceUrl, now, 1)],
        pinnedId: null,
      };
    } else {
      entry.label = f.label;
      if (f.kind === 'checkbox') {
        const only = entry.candidates[0];
        if (only && candidateMatches(only, f.value, f.displayValue)) {
          only.hitCount++;
          only.updatedAt = now;
          only.lastUrl = sourceUrl;
        } else {
          entry.candidates = [newCandidate(f.value, f.displayValue, sourceUrl, now, 1)];
          entry.pinnedId = null;
        }
      } else {
        const match = entry.candidates.find((c) => candidateMatches(c, f.value, f.displayValue));
        if (match) {
          match.hitCount++;
          match.updatedAt = now;
          match.lastUrl = sourceUrl;
        } else {
          entry.candidates.push(newCandidate(f.value, f.displayValue, sourceUrl, now, 1));
        }
      }
    }
    saved++;
  }

  for (const sig of bySignature.keys()) {
    const entry = all[sig];
    gcEntry(entry, now);
    if (entry && entry.candidates.length === 0) delete all[sig];
  }

  await writeAll(all);
  return saved;
}

/**
 * In-place GC of weak-and-old candidates. Guarantees:
 *  - Never deletes the only remaining candidate.
 *  - Never deletes the pinned candidate.
 *  - `pinnedId` is cleared if it no longer points to a candidate.
 */
function gcEntry(entry: FormEntry | undefined, now: number): void {
  if (!entry || entry.candidates.length <= 1) return;

  const survivors: FieldCandidate[] = [];
  for (const c of entry.candidates) {
    const weak = c.hitCount < WEAK_CANDIDATE_HIT_THRESHOLD;
    const stale = now - c.updatedAt > WEAK_CANDIDATE_AGE_MS;
    const pinned = c.id === entry.pinnedId;
    if (weak && stale && !pinned) continue;
    survivors.push(c);
  }
  if (survivors.length === 0) {
    // Keep the freshest one as a safety floor.
    const newest = [...entry.candidates].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    entry.candidates = [newest];
  } else {
    entry.candidates = survivors;
  }
  if (entry.pinnedId && !entry.candidates.some((c) => c.id === entry.pinnedId)) {
    entry.pinnedId = null;
  }
}

export async function listFormEntries(): Promise<FormEntriesMap> {
  return readAll();
}

export async function getFormEntry(signature: string): Promise<FormEntry | null> {
  const all = await readAll();
  return all[signature] ?? null;
}

export async function deleteFormEntry(signature: string): Promise<void> {
  const all = await readAll();
  if (signature in all) {
    delete all[signature];
    await writeAll(all);
    await clearDomainPrefsForSignature(signature);
  }
}

export async function clearAllFormEntries(): Promise<void> {
  await chrome.storage.local.set({ [KEY]: {} });
  await clearAllFieldDomainPrefs();
}

export async function setFormPin(
  signature: string,
  candidateId: string | null,
): Promise<void> {
  const all = await readAll();
  const entry = all[signature];
  if (!entry) return;
  if (candidateId !== null && !entry.candidates.some((c) => c.id === candidateId)) return;
  entry.pinnedId = candidateId;
  await writeAll(all);
}

export async function deleteCandidate(
  signature: string,
  candidateId: string,
): Promise<void> {
  const all = await readAll();
  const entry = all[signature];
  if (!entry) return;
  entry.candidates = entry.candidates.filter((c) => c.id !== candidateId);
  if (entry.candidates.length === 0) {
    delete all[signature];
    await writeAll(all);
    await clearDomainPrefsForSignature(signature);
    return;
  }
  if (entry.pinnedId === candidateId) entry.pinnedId = null;
  await writeAll(all);
  await clearPrefsPointingToCandidate(signature, candidateId);
}

export async function addCandidate(
  signature: string,
  value: string,
  displayValue: string | undefined,
): Promise<string | null> {
  const all = await readAll();
  const entry = all[signature];
  if (!entry) return null;
  if (entry.candidates.some((c) => candidateMatches(c, value, displayValue))) return null;
  const now = Date.now();
  const c = newCandidate(value, displayValue, '(manual)', now, 0);
  entry.candidates.push(c);
  await writeAll(all);
  return c.id;
}

export async function updateCandidate(
  signature: string,
  candidateId: string,
  value: string,
  displayValue: string | undefined,
): Promise<void> {
  const all = await readAll();
  const entry = all[signature];
  if (!entry) return;
  const c = entry.candidates.find((c) => c.id === candidateId);
  if (!c) return;
  c.value = value;
  c.displayValue = displayValue;
  c.updatedAt = Date.now();
  await writeAll(all);
}

export function resolveCandidate(
  entry: FormEntry,
  currentDomain: string,
  domainPrefs: Record<string, string>,
): FieldCandidate | null {
  if (entry.candidates.length === 0) return null;

  const prefId = domainPrefs[currentDomain];
  if (prefId) {
    const match = entry.candidates.find((c) => c.id === prefId);
    if (match) return match;
  }

  if (entry.pinnedId) {
    const pinned = entry.candidates.find((c) => c.id === entry.pinnedId);
    if (pinned) return pinned;
  }

  const sorted = [...entry.candidates].sort((a, b) => {
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.createdAt - b.createdAt;
  });
  return sorted[0];
}

export async function bumpCandidateHit(
  signature: string,
  candidateId: string,
  sourceUrl: string,
): Promise<void> {
  const all = await readAll();
  const entry = all[signature];
  if (!entry) return;
  const c = entry.candidates.find((c) => c.id === candidateId);
  if (!c) return;
  c.hitCount++;
  c.updatedAt = Date.now();
  c.lastUrl = sourceUrl;
  await writeAll(all);
}

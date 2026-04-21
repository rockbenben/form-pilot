// lib/capture/candidate.ts

/**
 * One saved alternate for a signature (Phase A form entries) or a resume field
 * (Phase B basic.phone / basic.email). Labels are Phase B-only; displayValue is
 * Phase A-only (radio/select option text).
 */
export interface FieldCandidate {
  id: string;
  value: string;
  displayValue?: string;
  label?: string;
  hitCount: number;
  createdAt: number;
  updatedAt: number;
  lastUrl: string;
}

/** Two candidates are the same "option" when value AND displayValue match. */
export function candidateMatches(
  c: FieldCandidate,
  value: string,
  displayValue?: string,
): boolean {
  return c.value === value && (c.displayValue ?? '') === (displayValue ?? '');
}

/**
 * Resolve which candidate fills a field. Pure — no I/O.
 *
 * 5-tier order:
 *   1. domainPrefs[currentDomain] (if it points to an existing candidate)
 *   2. pinnedId (if it points to an existing candidate)
 *   3. highest hitCount
 *   4. latest updatedAt (tiebreak)
 *   5. earliest createdAt (stable final tiebreak)
 */
export function resolveCandidate(
  candidates: FieldCandidate[],
  pinnedId: string | null,
  currentDomain: string,
  domainPrefs: Record<string, string>,
): FieldCandidate | null {
  if (candidates.length === 0) return null;

  const prefId = domainPrefs[currentDomain];
  if (prefId) {
    const match = candidates.find((c) => c.id === prefId);
    if (match) return match;
  }

  if (pinnedId) {
    const pinned = candidates.find((c) => c.id === pinnedId);
    if (pinned) return pinned;
  }

  const sorted = [...candidates].sort((a, b) => {
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.createdAt - b.createdAt;
  });
  return sorted[0];
}

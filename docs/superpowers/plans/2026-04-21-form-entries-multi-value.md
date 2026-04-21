# Form Entries Multi-Value Implementation Plan (Phase A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `lib/storage/form-store.ts`'s single-value-per-signature with per-signature candidate lists, a global pin + per-domain override resolution pipeline, an in-page ▾ picker, and a Dashboard editor. Phase 4 cross-URL fills pick candidates via the new pipeline; users can add / pin / delete / switch candidates in UI.

**Architecture:** One rewrite of the cross-URL store and its callers, plus two new files (`domain-prefs-store.ts`, `CandidatePicker/`). No migration — the extension is treated as brand-new. `saveFormEntries` appends-or-bumps candidates and GCs weak-and-old ones; `runFormPhase` delegates candidate choice to `resolveCandidate`; `bumpCandidateHit` records selection. The picker component is Shadow-DOM-mounted per multi-candidate field.

**Tech Stack:** WXT / Manifest V3, React 18, TypeScript, Tailwind CSS, Vitest + jsdom. `crypto.randomUUID()` for ids (no new deps).

**Spec:** `docs/superpowers/specs/2026-04-21-form-entries-multi-value-design.md`

---

## File Map

| Path | Create / Modify | Responsibility |
|------|-----------------|----------------|
| `lib/capture/constants.ts` | Create | GC thresholds |
| `lib/storage/form-store.ts` | Rewrite | New schema, append-or-bump, GC, pin, add/update/delete candidate, `resolveCandidate`, `bumpCandidateHit` |
| `lib/storage/domain-prefs-store.ts` | Create | `formpilot:fieldDomainPrefs` CRUD |
| `lib/capture/form-phase.ts` | Modify | Resolve per signature; return fills with candidateId |
| `lib/engine/orchestrator.ts` | Modify | Pass `domainPrefs` + `currentDomain`; feed fills to hit bump |
| `entrypoints/background.ts` | Modify | New message types + update `GET_FILL_CONTEXT` |
| `entrypoints/content.ts` | Modify | Bundle `domainPrefs` and `currentDomain`, call hit bump |
| `components/popup/sections/SavedPages.tsx` | Rewrite form tab | Candidate list, add/edit/delete, pin, domain-pref block |
| `components/capture/CandidatePicker.tsx` | Create | Picker UI (badge + popover + toast) |
| `components/capture/mount-candidate-picker.ts` | Create | Shadow-DOM mount + positioning |
| `lib/i18n/en.ts` / `zh.ts` | Modify | New picker + dashboard strings |
| `tests/lib/storage/form-store.test.ts` | Rewrite | New schema, save path, GC, pin, delete, add/update, resolve, hit bump |
| `tests/lib/storage/domain-prefs-store.test.ts` | Create | CRUD + cascade cleanup helper |
| `tests/lib/capture/form-phase.test.ts` | Rewrite | New signature, domain-pref integration, hit emission |

---

## Task 1: GC thresholds

**Files:**
- Create: `lib/capture/constants.ts`

- [ ] **Step 1: Create the constants file**

```typescript
// lib/capture/constants.ts
export const WEAK_CANDIDATE_HIT_THRESHOLD = 2;
export const WEAK_CANDIDATE_AGE_MS = 30 * 24 * 3600 * 1000;
```

- [ ] **Step 2: Commit**

```bash
git add lib/capture/constants.ts
git commit -m "feat(form-store): add GC thresholds for weak candidates"
```

---

## Task 2: Form-store schema + save path (append-or-bump, checkbox special)

Rewrites `form-store.ts` top-to-bottom. The test file is rewritten first and fails; implementation follows.

**Files:**
- Rewrite: `tests/lib/storage/form-store.test.ts`
- Rewrite: `lib/storage/form-store.ts`

- [ ] **Step 1: Rewrite the test file (failing)**

Replace the entire content of `tests/lib/storage/form-store.test.ts` with:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveFormEntries,
  getFormEntry,
  listFormEntries,
  clearAllFormEntries,
} from '@/lib/storage/form-store';
import type { CapturedField } from '@/lib/capture/types';

const mk = (
  sig: string,
  value: string,
  kind: CapturedField['kind'],
  displayValue?: string,
): CapturedField => ({
  selector: `#${sig}`,
  index: 0,
  kind,
  value,
  displayValue,
  signature: sig,
  label: sig,
});

describe('form-store · save path', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('creates a new entry with one candidate on first save', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    expect(entry).not.toBeNull();
    expect(entry!.candidates).toHaveLength(1);
    expect(entry!.candidates[0].value).toBe('a@x.com');
    expect(entry!.candidates[0].hitCount).toBe(1);
    expect(entry!.candidates[0].lastUrl).toBe('https://a.com/');
    expect(entry!.pinnedId).toBeNull();
    expect(entry!.candidates[0].id).toMatch(/[0-9a-f-]{36}/i);
  });

  it('bumps the existing candidate when saved (value, displayValue) matches', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    expect(entry!.candidates).toHaveLength(1);
    expect(entry!.candidates[0].hitCount).toBe(2);
    expect(entry!.candidates[0].lastUrl).toBe('https://b.com/');
  });

  it('appends a new candidate when (value, displayValue) differs', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'b@y.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    expect(entry!.candidates).toHaveLength(2);
    const values = entry!.candidates.map((c) => c.value).sort();
    expect(values).toEqual(['a@x.com', 'b@y.com']);
  });

  it('treats (value, displayValue) together as the dedupe key', async () => {
    await saveFormEntries([mk('gender', '1', 'radio', '男')], 'https://a.com/');
    await saveFormEntries([mk('gender', '1', 'radio', 'Male')], 'https://b.com/');
    const entry = await getFormEntry('gender');
    expect(entry!.candidates).toHaveLength(2);
  });

  it('refreshes the entry label on save', async () => {
    await saveFormEntries(
      [{ ...mk('x', 'v', 'text'), label: 'Old Label' }],
      'https://a.com/',
    );
    await saveFormEntries(
      [{ ...mk('x', 'v', 'text'), label: 'New Label' }],
      'https://b.com/',
    );
    const entry = await getFormEntry('x');
    expect(entry!.label).toBe('New Label');
  });

  it('dedupes same signature within a single save — one save = one hit', async () => {
    await saveFormEntries(
      [
        mk('email', 'a@x.com', 'text'),
        mk('email', 'b@y.com', 'text'),
      ],
      'https://a.com/',
    );
    const entry = await getFormEntry('email');
    // Second occurrence wins its value; only one candidate created.
    expect(entry!.candidates).toHaveLength(1);
    expect(entry!.candidates[0].value).toBe('b@y.com');
    expect(entry!.candidates[0].hitCount).toBe(1);
  });

  it('skips fields with empty value AND empty displayValue', async () => {
    await saveFormEntries([mk('empty', '', 'text')], 'https://a.com/');
    expect(await getFormEntry('empty')).toBeNull();
  });

  it('keeps fields where only displayValue is set', async () => {
    await saveFormEntries([mk('sel', '', 'select', '汉族')], 'https://a.com/');
    const entry = await getFormEntry('sel');
    expect(entry).not.toBeNull();
    expect(entry!.candidates[0].displayValue).toBe('汉族');
  });
});

describe('form-store · checkbox is single-candidate', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('bumps hitCount on identical checkbox save', async () => {
    await saveFormEntries([mk('news', 'true', 'checkbox')], 'https://a.com/');
    await saveFormEntries([mk('news', 'true', 'checkbox')], 'https://b.com/');
    const entry = await getFormEntry('news');
    expect(entry!.candidates).toHaveLength(1);
    expect(entry!.candidates[0].value).toBe('true');
    expect(entry!.candidates[0].hitCount).toBe(2);
  });

  it('replaces in place when checkbox value flips, resets hitCount to 1', async () => {
    await saveFormEntries([mk('news', 'true', 'checkbox')], 'https://a.com/');
    await saveFormEntries([mk('news', 'false', 'checkbox')], 'https://b.com/');
    const entry = await getFormEntry('news');
    expect(entry!.candidates).toHaveLength(1);
    expect(entry!.candidates[0].value).toBe('false');
    expect(entry!.candidates[0].hitCount).toBe(1);
    expect(entry!.pinnedId).toBeNull();
  });
});

describe('form-store · listing & clearing', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('clearAllFormEntries empties the store', async () => {
    await saveFormEntries(
      [mk('a', '1', 'text'), mk('b', '2', 'text')],
      'https://a.com/',
    );
    await clearAllFormEntries();
    expect(Object.keys(await listFormEntries())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests; verify they fail with compilation/import errors**

```bash
pnpm run test -- tests/lib/storage/form-store.test.ts
```

Expected: FAIL — most test names listed above will fail because the old store exports `FormEntry` with `.value` (single value), not `.candidates`.

- [ ] **Step 3: Rewrite `lib/storage/form-store.ts`**

Replace the entire file with:

```typescript
import type { CapturedField, CapturedFieldKind } from '@/lib/capture/types';
import {
  WEAK_CANDIDATE_AGE_MS,
  WEAK_CANDIDATE_HIT_THRESHOLD,
} from '@/lib/capture/constants';

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

function sameOption(c: FieldCandidate, value: string, displayValue?: string): boolean {
  return c.value === value && (c.displayValue ?? '') === (displayValue ?? '');
}

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
  const touched: string[] = [];
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
        if (only && sameOption(only, f.value, f.displayValue)) {
          only.hitCount++;
          only.updatedAt = now;
          only.lastUrl = sourceUrl;
        } else {
          entry.candidates = [newCandidate(f.value, f.displayValue, sourceUrl, now, 1)];
          entry.pinnedId = null;
        }
      } else {
        const match = entry.candidates.find((c) => sameOption(c, f.value, f.displayValue));
        if (match) {
          match.hitCount++;
          match.updatedAt = now;
          match.lastUrl = sourceUrl;
        } else {
          entry.candidates.push(newCandidate(f.value, f.displayValue, sourceUrl, now, 1));
        }
      }
    }
    touched.push(sig);
    saved++;
  }

  for (const sig of touched) {
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
  }
}

export async function clearAllFormEntries(): Promise<void> {
  await chrome.storage.local.set({ [KEY]: {} });
}
```

- [ ] **Step 4: Run tests; verify they pass**

```bash
pnpm run test -- tests/lib/storage/form-store.test.ts
```

Expected: all describe blocks above pass. If type errors appear in callers, they will be fixed in Tasks 5/6/7 — leave them for now.

- [ ] **Step 5: Commit**

```bash
git add lib/storage/form-store.ts tests/lib/storage/form-store.test.ts
git commit -m "feat(form-store): multi-candidate schema with append-or-bump save"
```

---

## Task 3: GC for weak-and-old candidates

GC already lives inside `saveFormEntries` (added in Task 2). This task adds direct tests so the boundary conditions are locked.

**Files:**
- Modify: `tests/lib/storage/form-store.test.ts`

- [ ] **Step 1: Append the GC describe block to the test file**

```typescript
import { WEAK_CANDIDATE_AGE_MS } from '@/lib/capture/constants';

describe('form-store · GC', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('does not GC the only remaining candidate no matter how weak', async () => {
    // Seed a weak old candidate by rewriting storage directly.
    await chrome.storage.local.set({
      'formpilot:formEntries': {
        sig1: {
          signature: 'sig1',
          kind: 'text',
          label: 'x',
          pinnedId: null,
          candidates: [{
            id: 'cand-1',
            value: 'old',
            hitCount: 0,
            createdAt: 0,
            updatedAt: 0,
            lastUrl: '(seed)',
          }],
        },
      },
    });
    // Trigger GC by saving an unrelated signature.
    await saveFormEntries([mk('other', 'v', 'text')], 'https://a.com/');
    const entry = await getFormEntry('sig1');
    // Untouched signatures are NOT GC'd. (GC is scoped to touched signatures.)
    expect(entry!.candidates).toHaveLength(1);
  });

  it('GCs weak and stale non-pinned candidates when their signature is touched', async () => {
    const staleTime = Date.now() - WEAK_CANDIDATE_AGE_MS - 1000;
    await chrome.storage.local.set({
      'formpilot:formEntries': {
        email: {
          signature: 'email',
          kind: 'text',
          label: 'Email',
          pinnedId: null,
          candidates: [
            { id: 'strong', value: 'a@x.com', hitCount: 5, createdAt: staleTime, updatedAt: staleTime, lastUrl: '' },
            { id: 'weak-old', value: 'b@y.com', hitCount: 1, createdAt: staleTime, updatedAt: staleTime, lastUrl: '' },
          ],
        },
      },
    });
    // Touch 'email' with a third distinct value so GC runs for this signature.
    await saveFormEntries([mk('email', 'c@z.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    const ids = entry!.candidates.map((c) => c.id).sort();
    expect(ids).not.toContain('weak-old');
    expect(ids).toContain('strong');
  });

  it('spares pinned candidates from GC even if weak and stale', async () => {
    const staleTime = Date.now() - WEAK_CANDIDATE_AGE_MS - 1000;
    await chrome.storage.local.set({
      'formpilot:formEntries': {
        email: {
          signature: 'email',
          kind: 'text',
          label: 'Email',
          pinnedId: 'pinned-weak',
          candidates: [
            { id: 'pinned-weak', value: 'a@x.com', hitCount: 1, createdAt: staleTime, updatedAt: staleTime, lastUrl: '' },
            { id: 'strong', value: 'b@y.com', hitCount: 5, createdAt: staleTime, updatedAt: staleTime, lastUrl: '' },
          ],
        },
      },
    });
    await saveFormEntries([mk('email', 'c@z.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    expect(entry!.candidates.some((c) => c.id === 'pinned-weak')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm run test -- tests/lib/storage/form-store.test.ts
```

Expected: all three new tests pass with the implementation from Task 2.

- [ ] **Step 3: Commit**

```bash
git add tests/lib/storage/form-store.test.ts
git commit -m "test(form-store): lock GC boundary conditions"
```

---

## Task 4: Pin, delete, and cascade cleanup

Adds `setFormPin`, `deleteCandidate`, and their tests. Cascade to `fieldDomainPrefs` is wired up in Task 6 (needs that store to exist first); here we just clear the pin reference.

**Files:**
- Modify: `lib/storage/form-store.ts`
- Modify: `tests/lib/storage/form-store.test.ts`

- [ ] **Step 1: Write the failing tests (append to `form-store.test.ts`)**

```typescript
import { setFormPin, deleteCandidate } from '@/lib/storage/form-store';

describe('form-store · pin', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('setFormPin sets and clears pinnedId', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'b@y.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    const target = entry!.candidates.find((c) => c.value === 'b@y.com')!;
    await setFormPin('email', target.id);
    expect((await getFormEntry('email'))!.pinnedId).toBe(target.id);
    await setFormPin('email', null);
    expect((await getFormEntry('email'))!.pinnedId).toBeNull();
  });

  it('setFormPin is a no-op for unknown candidateId', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await setFormPin('email', 'nope');
    expect((await getFormEntry('email'))!.pinnedId).toBeNull();
  });
});

describe('form-store · deleteCandidate', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('removes a candidate', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'b@y.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    const target = entry!.candidates.find((c) => c.value === 'b@y.com')!;
    await deleteCandidate('email', target.id);
    const after = await getFormEntry('email');
    expect(after!.candidates).toHaveLength(1);
    expect(after!.candidates[0].value).toBe('a@x.com');
  });

  it('clears pinnedId when the pinned candidate is deleted', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'b@y.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    const target = entry!.candidates.find((c) => c.value === 'b@y.com')!;
    await setFormPin('email', target.id);
    await deleteCandidate('email', target.id);
    expect((await getFormEntry('email'))!.pinnedId).toBeNull();
  });

  it('deletes the entire entry when the last candidate is removed', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    await deleteCandidate('email', entry!.candidates[0].id);
    expect(await getFormEntry('email')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify failing**

```bash
pnpm run test -- tests/lib/storage/form-store.test.ts
```

Expected: the three new tests fail (functions not exported).

- [ ] **Step 3: Add the two functions to `lib/storage/form-store.ts`**

Append at the bottom of the file:

```typescript
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
  } else if (entry.pinnedId === candidateId) {
    entry.pinnedId = null;
  }
  await writeAll(all);
}
```

- [ ] **Step 4: Run — verify passing**

```bash
pnpm run test -- tests/lib/storage/form-store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/storage/form-store.ts tests/lib/storage/form-store.test.ts
git commit -m "feat(form-store): pin toggle and candidate deletion with pin cleanup"
```

---

## Task 5: Manual add / inline edit of candidates

**Files:**
- Modify: `lib/storage/form-store.ts`
- Modify: `tests/lib/storage/form-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `form-store.test.ts`:

```typescript
import { addCandidate, updateCandidate } from '@/lib/storage/form-store';

describe('form-store · manual add / update', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('addCandidate appends a new candidate with hitCount 0', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const id = await addCandidate('email', 'manual@z.com', undefined);
    expect(id).not.toBeNull();
    const entry = await getFormEntry('email');
    const c = entry!.candidates.find((c) => c.id === id)!;
    expect(c.value).toBe('manual@z.com');
    expect(c.hitCount).toBe(0);
    expect(c.lastUrl).toBe('(manual)');
  });

  it('addCandidate is a no-op for unknown signature', async () => {
    const id = await addCandidate('missing', 'x', undefined);
    expect(id).toBeNull();
  });

  it('addCandidate rejects a duplicate (value, displayValue)', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const id = await addCandidate('email', 'a@x.com', undefined);
    expect(id).toBeNull();
    const entry = await getFormEntry('email');
    expect(entry!.candidates).toHaveLength(1);
  });

  it('updateCandidate changes value but keeps the id', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    const oldId = entry!.candidates[0].id;
    await updateCandidate('email', oldId, 'b@y.com', undefined);
    const after = await getFormEntry('email');
    expect(after!.candidates[0].id).toBe(oldId);
    expect(after!.candidates[0].value).toBe('b@y.com');
  });
});
```

- [ ] **Step 2: Run — expect failures**

```bash
pnpm run test -- tests/lib/storage/form-store.test.ts
```

- [ ] **Step 3: Implement**

Append to `lib/storage/form-store.ts`:

```typescript
export async function addCandidate(
  signature: string,
  value: string,
  displayValue: string | undefined,
): Promise<string | null> {
  const all = await readAll();
  const entry = all[signature];
  if (!entry) return null;
  if (entry.candidates.some((c) => sameOption(c, value, displayValue))) return null;
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
```

- [ ] **Step 4: Run — expect passing**

```bash
pnpm run test -- tests/lib/storage/form-store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/storage/form-store.ts tests/lib/storage/form-store.test.ts
git commit -m "feat(form-store): manual add and inline update of candidates"
```

---

## Task 6: `domain-prefs-store`

**Files:**
- Create: `lib/storage/domain-prefs-store.ts`
- Create: `tests/lib/storage/domain-prefs-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/storage/domain-prefs-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  listFieldDomainPrefs,
  setDomainPref,
  clearDomainPref,
  clearDomainPrefsForSignature,
  clearPrefsPointingToCandidate,
  normalizeDomain,
} from '@/lib/storage/domain-prefs-store';

describe('domain-prefs-store', () => {
  beforeEach(async () => {
    await chrome.storage.local.set({ 'formpilot:fieldDomainPrefs': {} });
  });

  it('sets and reads a pref', async () => {
    await setDomainPref('email', 'workday.com', 'cand-1');
    const all = await listFieldDomainPrefs();
    expect(all['email']['workday.com']).toBe('cand-1');
  });

  it('overwrites a pref on the same (signature, domain)', async () => {
    await setDomainPref('email', 'workday.com', 'cand-1');
    await setDomainPref('email', 'workday.com', 'cand-2');
    const all = await listFieldDomainPrefs();
    expect(all['email']['workday.com']).toBe('cand-2');
  });

  it('clearDomainPref removes one (signature, domain) and prunes empty signature maps', async () => {
    await setDomainPref('email', 'workday.com', 'cand-1');
    await clearDomainPref('email', 'workday.com');
    const all = await listFieldDomainPrefs();
    expect(all['email']).toBeUndefined();
  });

  it('clearDomainPrefsForSignature removes every domain for a signature', async () => {
    await setDomainPref('email', 'workday.com', 'c1');
    await setDomainPref('email', 'lagou.com', 'c2');
    await clearDomainPrefsForSignature('email');
    expect((await listFieldDomainPrefs())['email']).toBeUndefined();
  });

  it('clearPrefsPointingToCandidate removes only matching domain entries', async () => {
    await setDomainPref('email', 'workday.com', 'stale');
    await setDomainPref('email', 'lagou.com', 'keep');
    await clearPrefsPointingToCandidate('email', 'stale');
    const all = await listFieldDomainPrefs();
    expect(all['email']).toEqual({ 'lagou.com': 'keep' });
  });

  it('normalizeDomain strips www. prefix', () => {
    expect(normalizeDomain('www.example.com')).toBe('example.com');
    expect(normalizeDomain('example.com')).toBe('example.com');
    expect(normalizeDomain('sub.example.com')).toBe('sub.example.com');
  });
});
```

- [ ] **Step 2: Run — expect failures**

```bash
pnpm run test -- tests/lib/storage/domain-prefs-store.test.ts
```

- [ ] **Step 3: Implement the store**

```typescript
// lib/storage/domain-prefs-store.ts
const KEY = 'formpilot:fieldDomainPrefs';

export type FieldDomainPrefs = Record<string, Record<string, string>>;

export async function listFieldDomainPrefs(): Promise<FieldDomainPrefs> {
  const res = await chrome.storage.local.get(KEY);
  return (res[KEY] as FieldDomainPrefs | undefined) ?? {};
}

async function writeAll(all: FieldDomainPrefs): Promise<void> {
  await chrome.storage.local.set({ [KEY]: all });
}

export async function setDomainPref(
  signature: string,
  domain: string,
  candidateId: string,
): Promise<void> {
  const all = await listFieldDomainPrefs();
  if (!all[signature]) all[signature] = {};
  all[signature][domain] = candidateId;
  await writeAll(all);
}

export async function clearDomainPref(
  signature: string,
  domain: string,
): Promise<void> {
  const all = await listFieldDomainPrefs();
  if (!all[signature]) return;
  delete all[signature][domain];
  if (Object.keys(all[signature]).length === 0) delete all[signature];
  await writeAll(all);
}

export async function clearDomainPrefsForSignature(
  signature: string,
): Promise<void> {
  const all = await listFieldDomainPrefs();
  if (!all[signature]) return;
  delete all[signature];
  await writeAll(all);
}

export async function clearPrefsPointingToCandidate(
  signature: string,
  candidateId: string,
): Promise<void> {
  const all = await listFieldDomainPrefs();
  const sigMap = all[signature];
  if (!sigMap) return;
  for (const [domain, id] of Object.entries(sigMap)) {
    if (id === candidateId) delete sigMap[domain];
  }
  if (Object.keys(sigMap).length === 0) delete all[signature];
  await writeAll(all);
}

/** Normalize a hostname for use as a domain-pref key. */
export function normalizeDomain(hostname: string): string {
  return hostname.replace(/^www\./, '');
}
```

- [ ] **Step 4: Wire cascade cleanup into `deleteCandidate`**

In `lib/storage/form-store.ts`, import from the new store and extend `deleteCandidate`:

```typescript
import { clearPrefsPointingToCandidate, clearDomainPrefsForSignature } from './domain-prefs-store';

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
```

And extend `deleteFormEntry` similarly:

```typescript
export async function deleteFormEntry(signature: string): Promise<void> {
  const all = await readAll();
  if (signature in all) {
    delete all[signature];
    await writeAll(all);
    await clearDomainPrefsForSignature(signature);
  }
}
```

- [ ] **Step 5: Add a cascade test in `form-store.test.ts`**

```typescript
import { setDomainPref, listFieldDomainPrefs } from '@/lib/storage/domain-prefs-store';

describe('form-store · cascade cleanup on candidate delete', () => {
  beforeEach(async () => {
    await clearAllFormEntries();
    await chrome.storage.local.set({ 'formpilot:fieldDomainPrefs': {} });
  });

  it('removes matching domain prefs when a candidate is deleted', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'b@y.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    const bCand = entry!.candidates.find((c) => c.value === 'b@y.com')!;
    await setDomainPref('email', 'workday.com', bCand.id);
    await setDomainPref('email', 'lagou.com', entry!.candidates[0].id);

    await deleteCandidate('email', bCand.id);
    const prefs = await listFieldDomainPrefs();
    expect(prefs['email']).toEqual({ 'lagou.com': entry!.candidates[0].id });
  });

  it('removes all domain prefs when the entry is deleted wholesale', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    await setDomainPref('email', 'workday.com', entry!.candidates[0].id);
    await deleteFormEntry('email');
    expect((await listFieldDomainPrefs())['email']).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run — verify all passing**

```bash
pnpm run test -- tests/lib/storage/
```

- [ ] **Step 7: Commit**

```bash
git add lib/storage/domain-prefs-store.ts lib/storage/form-store.ts \
         tests/lib/storage/domain-prefs-store.test.ts \
         tests/lib/storage/form-store.test.ts
git commit -m "feat(form-store): domain prefs store + cascade cleanup on candidate/entry delete"
```

---

## Task 7: `resolveCandidate` + `bumpCandidateHit`

**Files:**
- Modify: `lib/storage/form-store.ts`
- Modify: `tests/lib/storage/form-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `form-store.test.ts`:

```typescript
import { resolveCandidate, bumpCandidateHit } from '@/lib/storage/form-store';
import type { FormEntry } from '@/lib/storage/form-store';

function mkEntry(candidates: Array<Partial<import('@/lib/storage/form-store').FieldCandidate>>, pinnedId: string | null = null): FormEntry {
  return {
    signature: 'sig',
    kind: 'text',
    label: 'lbl',
    pinnedId,
    candidates: candidates.map((c, i) => ({
      id: c.id ?? `c${i}`,
      value: c.value ?? `v${i}`,
      displayValue: c.displayValue,
      hitCount: c.hitCount ?? 1,
      createdAt: c.createdAt ?? 0,
      updatedAt: c.updatedAt ?? 0,
      lastUrl: c.lastUrl ?? '',
    })),
  };
}

describe('resolveCandidate', () => {
  it('picks domain pref first', () => {
    const entry = mkEntry([
      { id: 'a', hitCount: 10 },
      { id: 'b', hitCount: 1 },
    ]);
    const picked = resolveCandidate(entry, 'workday.com', { 'workday.com': 'b' });
    expect(picked!.id).toBe('b');
  });

  it('falls through to pin when the domain pref points to a missing candidate', () => {
    const entry = mkEntry([
      { id: 'a', hitCount: 1 },
      { id: 'b', hitCount: 10 },
    ], 'a');
    const picked = resolveCandidate(entry, 'workday.com', { 'workday.com': 'ghost' });
    expect(picked!.id).toBe('a');
  });

  it('uses pin when there is no domain pref', () => {
    const entry = mkEntry([
      { id: 'a', hitCount: 1 },
      { id: 'b', hitCount: 10 },
    ], 'a');
    expect(resolveCandidate(entry, 'workday.com', {})!.id).toBe('a');
  });

  it('uses highest hitCount when there is no pin', () => {
    const entry = mkEntry([
      { id: 'a', hitCount: 1 },
      { id: 'b', hitCount: 10 },
    ]);
    expect(resolveCandidate(entry, 'workday.com', {})!.id).toBe('b');
  });

  it('breaks hitCount ties by latest updatedAt', () => {
    const entry = mkEntry([
      { id: 'older', hitCount: 3, updatedAt: 100 },
      { id: 'newer', hitCount: 3, updatedAt: 200 },
    ]);
    expect(resolveCandidate(entry, 'workday.com', {})!.id).toBe('newer');
  });

  it('breaks further ties by earliest createdAt for stability', () => {
    const entry = mkEntry([
      { id: 'later-created', hitCount: 3, updatedAt: 100, createdAt: 50 },
      { id: 'earlier-created', hitCount: 3, updatedAt: 100, createdAt: 10 },
    ]);
    expect(resolveCandidate(entry, 'workday.com', {})!.id).toBe('earlier-created');
  });

  it('returns null for empty candidate list', () => {
    const entry = mkEntry([]);
    expect(resolveCandidate(entry, 'workday.com', {})).toBeNull();
  });
});

describe('bumpCandidateHit', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('increments hitCount, updates updatedAt and lastUrl', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    const id = entry!.candidates[0].id;
    const before = entry!.candidates[0].hitCount;
    await bumpCandidateHit('email', id, 'https://c.com/');
    const after = await getFormEntry('email');
    expect(after!.candidates[0].hitCount).toBe(before + 1);
    expect(after!.candidates[0].lastUrl).toBe('https://c.com/');
  });

  it('is a no-op for unknown signature / candidate', async () => {
    await bumpCandidateHit('missing', 'ghost', 'https://x.com/');
    // No throw; store remains empty.
    expect(Object.keys(await listFormEntries())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failures**

```bash
pnpm run test -- tests/lib/storage/form-store.test.ts
```

- [ ] **Step 3: Implement in `lib/storage/form-store.ts`**

Append to the file:

```typescript
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
```

- [ ] **Step 4: Run — verify passing**

```bash
pnpm run test -- tests/lib/storage/form-store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/storage/form-store.ts tests/lib/storage/form-store.test.ts
git commit -m "feat(form-store): resolveCandidate + bumpCandidateHit"
```

---

## Task 8: `form-phase.ts` uses `resolveCandidate`

Widens the Phase 4 signature to accept `domainPrefs` + `currentDomain` and returns the list of candidate hits so the caller can increment counters.

**Files:**
- Modify: `lib/capture/form-phase.ts`
- Modify: `tests/lib/capture/form-phase.test.ts`
- Modify: `lib/engine/orchestrator.ts`

- [ ] **Step 1: Rewrite `lib/capture/form-phase.ts`**

Replace the entire file with:

```typescript
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

    const candidate = resolveCandidate(entry, currentDomain, domainPrefs[sig] ?? {});
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
```

- [ ] **Step 2: Update `lib/engine/orchestrator.ts`**

In `orchestrateFill`, widen the signature and pass the extras to `runFormPhase`. Find the block starting at line 126 (approximately) and replace it:

```typescript
// Previously: if (Object.keys(formEntries).length > 0) { const formFilled = await runFormPhase(doc, scanned, formEntries); ... }
// New:
if (Object.keys(formEntries).length > 0) {
  const { filled: formFilled, hits } = await runFormPhase(
    doc,
    scanned,
    formEntries,
    domainPrefs,
    currentDomain,
  );
  if (formFilled > 0) {
    const byElement = new Map(items.map((it) => [it.element, it] as const));
    // ... existing byElement hydration code stays as-is ...
  }
  // Expose hits so the caller (content.ts) can bump hitCount.
  result.formHits = hits;
}
```

Extend the `orchestrateFill` parameter list:

```typescript
export async function orchestrateFill(
  doc: Document,
  resume: Resume,
  adapter: PlatformAdapter | null,
  memory: PageMemoryEntry[],
  formEntries: FormEntriesMap,
  domainPrefs: FieldDomainPrefs,
  currentDomain: string,
): Promise<FillResult> { ... }
```

Import `FieldDomainPrefs` at the top:

```typescript
import type { FieldDomainPrefs } from '@/lib/storage/domain-prefs-store';
import type { FormPhaseFill } from '@/lib/capture/form-phase';
```

Update `FillResult` in the orchestrator module so `formHits` is a known optional field (not an ad-hoc cast). Search for the `FillResult` export and append:

```typescript
export interface FillResult {
  // ... existing fields ...
  formHits?: FormPhaseFill[];
}
```

- [ ] **Step 3: Rewrite `tests/lib/capture/form-phase.test.ts`**

Open the existing file. Replace tests that build an old-shape `FormEntry` (with `.value` / `.displayValue` / `.hitCount` at the top level) with ones that use `.candidates`. The test scaffolding helper:

```typescript
import type { FormEntry, FieldCandidate } from '@/lib/storage/form-store';

function mkEntry(sig: string, kind: FormEntry['kind'], candidates: Partial<FieldCandidate>[], pinnedId: string | null = null): FormEntry {
  return {
    signature: sig,
    kind,
    label: sig,
    pinnedId,
    candidates: candidates.map((c, i) => ({
      id: c.id ?? `${sig}-c${i}`,
      value: c.value ?? '',
      displayValue: c.displayValue,
      hitCount: c.hitCount ?? 1,
      createdAt: c.createdAt ?? 0,
      updatedAt: c.updatedAt ?? 0,
      lastUrl: c.lastUrl ?? '',
    })),
  };
}
```

Rewrite each existing test in the file to:
1. Pass a `FormEntriesMap` whose entries use `.candidates`.
2. Pass `{}` as `domainPrefs` and `''` as `currentDomain` unless the test is about domain prefs.
3. Assert on the returned object shape: `{ filled, hits }` instead of a bare count.

Add one new test exercising domain prefs:

```typescript
it('prefers the domain-pref candidate over the highest-hitCount one', async () => {
  document.body.innerHTML = `<label>Email<input id="e1" /></label>`;
  const el = document.querySelector<HTMLInputElement>('#e1')!;
  const sig = computeSignatureFor(el);
  const entries: FormEntriesMap = {
    [sig]: mkEntry(sig, 'text', [
      { id: 'strong', value: 'strong@x.com', hitCount: 10 },
      { id: 'prefer', value: 'prefer@y.com', hitCount: 1 },
    ]),
  };
  const items = scan(document);

  const result = await runFormPhase(
    document,
    items,
    entries,
    { [sig]: { 'workday.com': 'prefer' } },
    'workday.com',
  );
  expect(result.filled).toBe(1);
  expect(el.value).toBe('prefer@y.com');
  expect(result.hits).toEqual([{ signature: sig, candidateId: 'prefer' }]);
});
```

(`scan` and `computeSignatureFor` already used in the old tests — keep those imports.)

- [ ] **Step 4: Run capture tests — verify passing**

```bash
pnpm run test -- tests/lib/capture/form-phase.test.ts
```

- [ ] **Step 5: Run the full suite; fix any orchestrator compile errors that surface**

```bash
pnpm run test
```

Expected: other suites may flag orchestrator type errors from the widened signature — those will be handled in Task 9.

- [ ] **Step 6: Commit**

```bash
git add lib/capture/form-phase.ts lib/engine/orchestrator.ts tests/lib/capture/form-phase.test.ts
git commit -m "feat(form-phase): resolve per-signature candidate with domain pref support"
```

---

## Task 9: Background message routing + `GET_FILL_CONTEXT` shape

**Files:**
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Extend `GET_FILL_CONTEXT` to bundle `domainPrefs` and `currentDomain`**

Accept a `pageDomain` in the message payload. Import the new store. Change the handler:

```typescript
case 'GET_FILL_CONTEXT': {
  const { memoryUrl, pageDomain } = (message as unknown) as {
    memoryUrl?: string;
    pageDomain?: string;
  };
  const id = await getActiveResumeId();
  const domainPrefsStore = await import('@/lib/storage/domain-prefs-store');
  const [resume, memory, formEntries, domainPrefs] = await Promise.all([
    id ? getResume(id) : Promise.resolve(null),
    memoryUrl ? memStore.getPageMemory(memoryUrl) : Promise.resolve([]),
    formStore.listFormEntries(),
    domainPrefsStore.listFieldDomainPrefs(),
  ]);
  return { ok: true, data: { resume, memory, formEntries, domainPrefs, currentDomain: pageDomain ?? '' } };
}
```

- [ ] **Step 2: Add new message routes**

In the same switch, add cases for every new message type defined in the spec:

```typescript
case 'DELETE_FORM_CANDIDATE': {
  const { signature, candidateId } = (message as unknown) as { signature: string; candidateId: string };
  await formStore.deleteCandidate(signature, candidateId);
  return { ok: true };
}
case 'UPDATE_FORM_CANDIDATE': {
  const { signature, candidateId, value, displayValue } = (message as unknown) as {
    signature: string; candidateId: string; value: string; displayValue?: string;
  };
  await formStore.updateCandidate(signature, candidateId, value, displayValue);
  return { ok: true };
}
case 'ADD_FORM_CANDIDATE': {
  const { signature, value, displayValue } = (message as unknown) as {
    signature: string; value: string; displayValue?: string;
  };
  const id = await formStore.addCandidate(signature, value, displayValue);
  return { ok: true, data: { id } };
}
case 'SET_FORM_PIN': {
  const { signature, candidateId } = (message as unknown) as { signature: string; candidateId: string | null };
  await formStore.setFormPin(signature, candidateId);
  return { ok: true };
}
case 'BUMP_FORM_HIT': {
  const { signature, candidateId, sourceUrl } = (message as unknown) as {
    signature: string; candidateId: string; sourceUrl: string;
  };
  await formStore.bumpCandidateHit(signature, candidateId, sourceUrl);
  return { ok: true };
}
case 'LIST_DOMAIN_PREFS': {
  const domainPrefsStore = await import('@/lib/storage/domain-prefs-store');
  return { ok: true, data: await domainPrefsStore.listFieldDomainPrefs() };
}
case 'SET_DOMAIN_PREF': {
  const { signature, domain, candidateId } = (message as unknown) as {
    signature: string; domain: string; candidateId: string;
  };
  const domainPrefsStore = await import('@/lib/storage/domain-prefs-store');
  await domainPrefsStore.setDomainPref(signature, domain, candidateId);
  return { ok: true };
}
case 'CLEAR_DOMAIN_PREF': {
  const { signature, domain } = (message as unknown) as { signature: string; domain: string };
  const domainPrefsStore = await import('@/lib/storage/domain-prefs-store');
  await domainPrefsStore.clearDomainPref(signature, domain);
  return { ok: true };
}
```

- [ ] **Step 3: Run the test suite to confirm background still compiles**

```bash
pnpm run test
```

- [ ] **Step 4: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat(background): route candidate / pin / domain-pref messages; bundle domainPrefs in fill context"
```

---

## Task 10: Content-script integration (pass domain info; bump hitCount on fills)

**Files:**
- Modify: `entrypoints/content.ts`

- [ ] **Step 1: Update the `FillContext` shape and `fetchFillContext`**

Near line 69 (the interface declaration) and 80 (`fetchFillContext`), change to:

```typescript
import { normalizeDomain, type FieldDomainPrefs } from '@/lib/storage/domain-prefs-store';

interface FillContext {
  resume: Resume | null;
  memory: PageMemoryEntry[];
  formEntries: Record<string, FormEntry>;
  domainPrefs: FieldDomainPrefs;
  currentDomain: string;
}

async function fetchFillContext(): Promise<FillContext> {
  const currentDomain = normalizeDomain(window.location.hostname);
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'GET_FILL_CONTEXT',
      memoryUrl: normalizeUrlForMemory(window.location.href),
      pageDomain: currentDomain,
    });
    if (res?.ok) {
      const data = res.data as {
        resume: Resume | null;
        memory: PageMemoryEntry[];
        formEntries: Record<string, FormEntry>;
        domainPrefs: FieldDomainPrefs;
        currentDomain: string;
      };
      return {
        resume: data.resume,
        memory: data.memory ?? [],
        formEntries: data.formEntries ?? {},
        domainPrefs: data.domainPrefs ?? {},
        currentDomain: data.currentDomain || currentDomain,
      };
    }
  } catch { /* ignore */ }
  return {
    resume: null, memory: [], formEntries: {},
    domainPrefs: {}, currentDomain,
  };
}
```

- [ ] **Step 2: Thread `domainPrefs` / `currentDomain` through `orchestrateFill`, bump hit counts on success**

```typescript
async function handleFill(): Promise<FillResult> {
  const empty: FillResult = { items: [], filled: 0, uncertain: 0, unrecognized: 0 };
  try {
    const { resume, memory, formEntries, domainPrefs, currentDomain } = await fetchFillContext();
    const adapter = findAdapter(window.location.href);
    const effectiveResume = resume ?? createEmptyResume('_', '_');
    const result = await orchestrateFill(
      document,
      effectiveResume,
      adapter,
      memory,
      formEntries,
      domainPrefs,
      currentDomain,
    );
    applyFieldHighlights(result);
    // Bump hitCount for each Phase-4 fill.
    const hits = (result as FillResult & { formHits?: { signature: string; candidateId: string }[] }).formHits ?? [];
    for (const hit of hits) {
      chrome.runtime.sendMessage({
        type: 'BUMP_FORM_HIT',
        signature: hit.signature,
        candidateId: hit.candidateId,
        sourceUrl: window.location.href,
      });
    }
    return result;
  } catch {
    return empty;
  }
}
```

- [ ] **Step 3: Run a full build to confirm**

```bash
pnpm run build
```

Expected: build succeeds with no type errors. If TypeScript complains about the new `FillResult.formHits`, ensure the declaration added in Task 8 is exported from the orchestrator module.

- [ ] **Step 4: Run tests**

```bash
pnpm run test
```

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat(content): bundle domain prefs in fill context; bump hitCount on Phase 4 fills"
```

---

## Task 11: i18n — picker and dashboard strings

**Files:**
- Modify: `lib/i18n/en.ts`
- Modify: `lib/i18n/zh.ts`

- [ ] **Step 1: Add the new keys to `lib/i18n/en.ts`**

Append before the closing `};`:

```typescript
  // ── Multi-value candidate picker ─────────────────────────────
  'candidate.picker.manage': 'Manage all candidates →',
  'candidate.picker.pin': 'Pin as default',
  'candidate.picker.unpin': 'Unpin',
  'candidate.picker.delete': 'Delete candidate',
  'candidate.picker.hitCountLabel': '{n} hits',
  'candidate.picker.lastSeen': 'Last seen on {domain}',
  'candidate.domainPref.rememberToast': 'Remember "{value}" on {domain}?',
  'candidate.domainPref.remember': 'Remember',
  'candidate.domainPref.onceOnly': 'Once only',
  'candidate.domainPref.cancel': 'Cancel',
  'candidate.dashboard.addCandidate': 'Add candidate',
  'candidate.dashboard.domainOverrides': 'Domain overrides',
  'candidate.dashboard.candidatesCount': '{n} candidates',
  'candidate.dashboard.defaultLabel': 'Default: {value}',
  'candidate.dashboard.editValue': 'Edit value',
  'candidate.dashboard.valuePlaceholder': 'Value',
  'candidate.dashboard.displayValuePlaceholder': 'Display text (for select/radio)',
  'candidate.dashboard.save': 'Save',
  'candidate.dashboard.cancel': 'Cancel',
```

- [ ] **Step 2: Add the same keys to `lib/i18n/zh.ts`**

```typescript
  // ── 多候选值选择器 ─────────────────────────────────────────
  'candidate.picker.manage': '管理全部候选 →',
  'candidate.picker.pin': '设为默认',
  'candidate.picker.unpin': '取消默认',
  'candidate.picker.delete': '删除候选',
  'candidate.picker.hitCountLabel': '{n} 次命中',
  'candidate.picker.lastSeen': '上次在 {domain}',
  'candidate.domainPref.rememberToast': '在 {domain} 下记住用「{value}」？',
  'candidate.domainPref.remember': '记住',
  'candidate.domainPref.onceOnly': '只此一次',
  'candidate.domainPref.cancel': '取消',
  'candidate.dashboard.addCandidate': '新增候选',
  'candidate.dashboard.domainOverrides': '按域名覆盖',
  'candidate.dashboard.candidatesCount': '{n} 个候选',
  'candidate.dashboard.defaultLabel': '默认：{value}',
  'candidate.dashboard.editValue': '编辑值',
  'candidate.dashboard.valuePlaceholder': '值',
  'candidate.dashboard.displayValuePlaceholder': '显示文本（select/radio 用）',
  'candidate.dashboard.save': '保存',
  'candidate.dashboard.cancel': '取消',
```

- [ ] **Step 3: Commit**

```bash
git add lib/i18n/en.ts lib/i18n/zh.ts
git commit -m "i18n: candidate picker + dashboard strings (en + zh)"
```

---

## Task 12: SavedPages Form tab — candidate list, add/edit/delete, pin, domain prefs

**Files:**
- Rewrite the `tab === 'form'` block in `components/popup/sections/SavedPages.tsx`

- [ ] **Step 1: Update imports at the top of the file**

```typescript
import type { FieldCandidate, FormEntry } from '@/lib/storage/form-store';
import type { FieldDomainPrefs } from '@/lib/storage/domain-prefs-store';
```

- [ ] **Step 2: Load domain prefs alongside form entries**

Add a `domainPrefs` state and fetch it in `refresh`:

```typescript
const [domainPrefs, setDomainPrefs] = useState<FieldDomainPrefs>({});

const refresh = useCallback(async () => {
  const [d, m, f, dp] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'LIST_DRAFTS' }),
    chrome.runtime.sendMessage({ type: 'LIST_PAGE_MEMORY' }),
    chrome.runtime.sendMessage({ type: 'LIST_FORM_ENTRIES' }),
    chrome.runtime.sendMessage({ type: 'LIST_DOMAIN_PREFS' }),
  ]);
  setDrafts(d?.ok ? (d.data as DraftSnapshot[]) : []);
  setMemory(m?.ok ? (m.data as Record<string, PageMemoryEntry[]>) : {});
  setFormEntries(f?.ok ? (f.data as Record<string, FormEntry>) : {});
  setDomainPrefs(dp?.ok ? (dp.data as FieldDomainPrefs) : {});
}, []);
```

- [ ] **Step 3: Replace the `sortedFormEntries` mapping**

```typescript
// default-picker mirror of resolveCandidate(entry, '', {}) — skip step 1 of resolution
function pickDefault(entry: FormEntry): FieldCandidate | null {
  if (entry.candidates.length === 0) return null;
  if (entry.pinnedId) {
    const pinned = entry.candidates.find((c) => c.id === entry.pinnedId);
    if (pinned) return pinned;
  }
  return [...entry.candidates].sort((a, b) => {
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.createdAt - b.createdAt;
  })[0];
}

const sortedFormEntries = Object.values(formEntries).sort((a, b) => {
  const ad = pickDefault(a), bd = pickDefault(b);
  if ((bd?.hitCount ?? 0) !== (ad?.hitCount ?? 0)) return (bd?.hitCount ?? 0) - (ad?.hitCount ?? 0);
  return (bd?.updatedAt ?? 0) - (ad?.updatedAt ?? 0);
});
```

- [ ] **Step 4: Replace the `tab === 'form'` JSX**

```tsx
{tab === 'form' && (
  sortedFormEntries.length === 0 ? (
    <div className="text-gray-500">{t('savedPages.form.empty')}</div>
  ) : (
    <>
      <div className="flex justify-end mb-2">
        <button
          onClick={clearAllFormEntries}
          className="text-xs px-2 py-1 text-red-400 hover:text-red-300 border border-red-900/40 rounded"
        >
          {t('savedPages.form.clearAll')}
        </button>
      </div>
      <div className="space-y-2">
        {sortedFormEntries.map((e) => {
          const key = `form:${e.signature}`;
          const isOpen = expanded.has(key);
          const def = pickDefault(e);
          const defText = def ? displayValue(def.displayValue ?? def.value) : '—';
          const domains = domainPrefs[e.signature] ?? {};
          return (
            <div key={e.signature} className="border border-gray-800 rounded">
              <button
                className="w-full text-left p-2 flex items-center justify-between hover:bg-gray-800/40"
                onClick={() => toggleExpand(key)}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate" title={e.label}>{e.label || '—'}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {t('candidate.dashboard.defaultLabel', { value: truncate(defText, 60) })}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
                  <span>{t('candidate.dashboard.candidatesCount', { n: String(e.candidates.length) })}</span>
                  {e.pinnedId && <span title={t('candidate.picker.pin')}>★</span>}
                </div>
              </button>
              {isOpen && (
                <FormEntryPanel
                  entry={e}
                  domains={domains}
                  onChanged={refresh}
                  now={now}
                  t={t}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  )
)}
```

- [ ] **Step 5: Add the `FormEntryPanel` component at the bottom of the same file (below the default export)**

```tsx
function FormEntryPanel({
  entry, domains, onChanged, now, t,
}: {
  entry: FormEntry;
  domains: Record<string, string>;
  onChanged: () => void;
  now: number;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const [adding, setAdding] = React.useState(false);
  const [addValue, setAddValue] = React.useState('');
  const [addDisplayValue, setAddDisplayValue] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [editDisplayValue, setEditDisplayValue] = React.useState('');
  const needsDisplay = entry.kind === 'radio' || entry.kind === 'select';

  const deleteCandidate = async (candidateId: string) => {
    await chrome.runtime.sendMessage({ type: 'DELETE_FORM_CANDIDATE', signature: entry.signature, candidateId });
    onChanged();
  };
  const togglePin = async (candidateId: string) => {
    const next = entry.pinnedId === candidateId ? null : candidateId;
    await chrome.runtime.sendMessage({ type: 'SET_FORM_PIN', signature: entry.signature, candidateId: next });
    onChanged();
  };
  const submitAdd = async () => {
    if (!addValue && !addDisplayValue) return;
    await chrome.runtime.sendMessage({
      type: 'ADD_FORM_CANDIDATE',
      signature: entry.signature,
      value: addValue,
      displayValue: needsDisplay ? addDisplayValue : undefined,
    });
    setAdding(false); setAddValue(''); setAddDisplayValue('');
    onChanged();
  };
  const beginEdit = (c: FieldCandidate) => {
    setEditingId(c.id);
    setEditValue(c.value);
    setEditDisplayValue(c.displayValue ?? '');
  };
  const submitEdit = async (candidateId: string) => {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_FORM_CANDIDATE',
      signature: entry.signature,
      candidateId,
      value: editValue,
      displayValue: needsDisplay ? editDisplayValue : undefined,
    });
    setEditingId(null);
    onChanged();
  };
  const clearDomainOverride = async (domain: string) => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_DOMAIN_PREF', signature: entry.signature, domain });
    onChanged();
  };

  return (
    <div className="border-t border-gray-800 p-2 space-y-3">
      <div className="space-y-1">
        {entry.candidates.map((c) => {
          const editing = editingId === c.id;
          return (
            <div key={c.id} className="flex items-start gap-2 text-xs py-1">
              <div className="flex-1 min-w-0">
                {editing ? (
                  <div className="space-y-1">
                    <input
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1"
                      value={editValue} onChange={(e) => setEditValue(e.target.value)}
                      placeholder={t('candidate.dashboard.valuePlaceholder')}
                    />
                    {needsDisplay && (
                      <input
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1"
                        value={editDisplayValue} onChange={(e) => setEditDisplayValue(e.target.value)}
                        placeholder={t('candidate.dashboard.displayValuePlaceholder')}
                      />
                    )}
                    <div className="flex gap-2">
                      <button className="text-blue-400" onClick={() => submitEdit(c.id)}>
                        {t('candidate.dashboard.save')}
                      </button>
                      <button className="text-gray-400" onClick={() => setEditingId(null)}>
                        {t('candidate.dashboard.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-gray-200 break-all">
                      {c.displayValue ?? c.value}
                    </div>
                    <div className="text-gray-500">
                      {t('candidate.picker.lastSeen', { domain: c.lastUrl || '—' })} ·{' '}
                      {t('candidate.picker.hitCountLabel', { n: String(c.hitCount) })} ·{' '}
                      {formatRelativeTime(c.updatedAt, now, t)}
                    </div>
                  </>
                )}
              </div>
              {!editing && (
                <div className="flex gap-2 shrink-0 text-gray-400">
                  <button title={t('candidate.dashboard.editValue')} onClick={() => beginEdit(c)}>✎</button>
                  <button
                    title={entry.pinnedId === c.id ? t('candidate.picker.unpin') : t('candidate.picker.pin')}
                    onClick={() => togglePin(c.id)}
                  >
                    {entry.pinnedId === c.id ? '★' : '☆'}
                  </button>
                  <button
                    title={t('candidate.picker.delete')}
                    onClick={() => deleteCandidate(c.id)}
                    className="text-red-400 hover:text-red-300"
                  >🗑</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="space-y-1">
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
            value={addValue} onChange={(e) => setAddValue(e.target.value)}
            placeholder={t('candidate.dashboard.valuePlaceholder')}
          />
          {needsDisplay && (
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
              value={addDisplayValue} onChange={(e) => setAddDisplayValue(e.target.value)}
              placeholder={t('candidate.dashboard.displayValuePlaceholder')}
            />
          )}
          <div className="flex gap-2 text-xs">
            <button className="text-blue-400" onClick={submitAdd}>{t('candidate.dashboard.save')}</button>
            <button className="text-gray-400" onClick={() => setAdding(false)}>{t('candidate.dashboard.cancel')}</button>
          </div>
        </div>
      ) : (
        <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => setAdding(true)}>
          + {t('candidate.dashboard.addCandidate')}
        </button>
      )}

      {Object.keys(domains).length > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <div className="text-xs text-gray-500 mb-1">
            {t('candidate.dashboard.domainOverrides')}
          </div>
          <div className="space-y-1">
            {Object.entries(domains).map(([domain, candidateId]) => {
              const cand = entry.candidates.find((c) => c.id === candidateId);
              return (
                <div key={domain} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">
                    {domain} → {cand ? (cand.displayValue ?? cand.value) : '(missing)'}
                  </span>
                  <button
                    className="text-red-400 hover:text-red-300"
                    onClick={() => clearDomainOverride(domain)}
                  >🗑</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Remove the old single-value `deleteFormEntry` column-based table rendering**

Ensure the only reference to `e.value`, `e.displayValue`, `e.hitCount`, `e.lastUrl` at the top level of `FormEntry` is gone. The new schema has `e.candidates`.

- [ ] **Step 7: Build and manually smoke-test the popup**

```bash
pnpm run dev
```

Load the extension, open the Dashboard → Saved Pages → Form tab. With no entries present, the empty message renders. Confirm no console errors.

- [ ] **Step 8: Commit**

```bash
git add components/popup/sections/SavedPages.tsx
git commit -m "feat(dashboard): candidate list editor with pin and domain overrides"
```

---

## Task 13: In-page `CandidatePicker` (▾ badge + popover + toast)

**Files:**
- Create: `components/capture/CandidatePicker.tsx`
- Create: `components/capture/mount-candidate-picker.ts`
- Modify: `entrypoints/content.ts` (mount the pickers after Phase 4 runs)

- [ ] **Step 1: Build `CandidatePicker.tsx`**

```tsx
// components/capture/CandidatePicker.tsx
import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { formatRelativeTime } from '@/lib/capture/time-format';
import type { FieldCandidate } from '@/lib/storage/form-store';

export interface CandidatePickerProps {
  candidates: FieldCandidate[];
  pinnedId: string | null;
  currentCandidateId: string | null;
  onSelect: (candidateId: string) => void;
  onPinToggle: (candidateId: string) => void;
  onDelete: (candidateId: string) => void;
  onManageAll: () => void;
}

export function CandidatePicker({
  candidates, pinnedId, currentCandidateId,
  onSelect, onPinToggle, onDelete, onManageAll,
}: CandidatePickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const now = Date.now();

  return (
    <div className="relative inline-block">
      <button
        className="w-3 h-3 text-[10px] leading-none bg-gray-800 text-gray-300 rounded-full border border-gray-600 flex items-center justify-center"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="Switch candidate"
      >▾</button>
      {open && (
        <div
          className="absolute z-[9999] mt-1 w-64 bg-gray-900 border border-gray-700 rounded shadow-lg p-1 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {candidates.map((c) => {
            const isCurrent = c.id === currentCandidateId;
            const isPinned = c.id === pinnedId;
            return (
              <div key={c.id} className="flex items-start gap-2 p-1 hover:bg-gray-800 rounded">
                <button className="flex-1 text-left min-w-0" onClick={() => { setOpen(false); onSelect(c.id); }}>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400">{isCurrent ? '●' : '○'}</span>
                    <span className="text-gray-100 truncate">{c.displayValue ?? c.value}</span>
                  </div>
                  <div className="text-gray-500 pl-4">
                    {t('candidate.picker.lastSeen', { domain: c.lastUrl || '—' })} ·{' '}
                    {t('candidate.picker.hitCountLabel', { n: String(c.hitCount) })}
                  </div>
                </button>
                <button
                  onClick={() => onPinToggle(c.id)}
                  title={isPinned ? t('candidate.picker.unpin') : t('candidate.picker.pin')}
                  className="text-gray-400 hover:text-yellow-400"
                >{isPinned ? '★' : '☆'}</button>
                <button
                  onClick={() => onDelete(c.id)}
                  title={t('candidate.picker.delete')}
                  className="text-red-400 hover:text-red-300"
                >🗑</button>
              </div>
            );
          })}
          <div className="border-t border-gray-700 mt-1 pt-1 px-1">
            <button className="text-blue-400 hover:text-blue-300" onClick={onManageAll}>
              {t('candidate.picker.manage')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build `mount-candidate-picker.ts`**

```typescript
// components/capture/mount-candidate-picker.ts
import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '@/lib/i18n';
import { CandidatePicker } from './CandidatePicker';
import type { FieldCandidate } from '@/lib/storage/form-store';

interface MountOpts {
  target: Element;
  candidates: FieldCandidate[];
  pinnedId: string | null;
  currentCandidateId: string | null;
  signature: string;
  onSelect: (candidateId: string) => void;
  onPinToggle: (candidateId: string) => void;
  onDelete: (candidateId: string) => void;
  onManageAll: () => void;
}

export function mountCandidatePicker(opts: MountOpts): () => void {
  const host = document.createElement('div');
  host.setAttribute('data-formpilot-picker', opts.signature);
  host.style.position = 'absolute';
  host.style.zIndex = '2147483600';
  host.style.pointerEvents = 'auto';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const root = document.createElement('div');
  shadow.appendChild(root);

  const position = () => {
    const rect = opts.target.getBoundingClientRect();
    host.style.top = `${rect.top + window.scrollY + rect.height / 2 - 6}px`;
    host.style.left = `${rect.right + window.scrollX + 2}px`;
  };
  position();
  window.addEventListener('scroll', position, true);
  window.addEventListener('resize', position);

  const reactRoot = createRoot(root);
  reactRoot.render(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(CandidatePicker, {
        candidates: opts.candidates,
        pinnedId: opts.pinnedId,
        currentCandidateId: opts.currentCandidateId,
        onSelect: opts.onSelect,
        onPinToggle: opts.onPinToggle,
        onDelete: opts.onDelete,
        onManageAll: opts.onManageAll,
      }),
    ),
  );

  return () => {
    window.removeEventListener('scroll', position, true);
    window.removeEventListener('resize', position);
    reactRoot.unmount();
    host.remove();
  };
}
```

- [ ] **Step 3: Wire into `entrypoints/content.ts`**

After the Phase 4 fill-and-bump block, iterate multi-candidate signatures and mount one picker per target element. Append after the bump loop:

```typescript
import { mountCandidatePicker } from '@/components/capture/mount-candidate-picker';

// After hits loop:
const mounted: Array<() => void> = [];
for (const it of result.items) {
  if (it.source !== 'form') continue;
  const sig = computeSignatureFor(it.element);
  const entry = formEntries[sig];
  if (!entry || entry.candidates.length < 2) continue;
  if (entry.kind === 'checkbox') continue;
  const current = hits.find((h) => h.signature === sig)?.candidateId ?? null;
  mounted.push(mountCandidatePicker({
    target: it.element,
    signature: sig,
    candidates: entry.candidates,
    pinnedId: entry.pinnedId,
    currentCandidateId: current,
    onSelect: async (cid) => {
      // Fill with the new candidate's value using existing fillElement.
      const picked = entry.candidates.find((c) => c.id === cid);
      if (!picked) return;
      const val = picked.displayValue && picked.displayValue.length > 0
        ? picked.displayValue : picked.value;
      await fillElement(it.element, val, it.kind ?? entry.kind);
      chrome.runtime.sendMessage({
        type: 'BUMP_FORM_HIT', signature: sig, candidateId: cid, sourceUrl: window.location.href,
      });
      // TODO(next step): trigger domain-pref toast via SaveMenu/ToolbarToast.
    },
    onPinToggle: async (cid) => {
      const next = entry.pinnedId === cid ? null : cid;
      await chrome.runtime.sendMessage({ type: 'SET_FORM_PIN', signature: sig, candidateId: next });
    },
    onDelete: async (cid) => {
      await chrome.runtime.sendMessage({ type: 'DELETE_FORM_CANDIDATE', signature: sig, candidateId: cid });
    },
    onManageAll: () => {
      chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD', focus: `form-entry:${sig}` });
    },
  }));
}
// Track mounted pickers per-session so they can be cleaned up on re-fill.
(window as unknown as { __formpilotPickers?: Array<() => void> }).__formpilotPickers = mounted;
```

And at the top of `handleFill`, unmount previous pickers:

```typescript
const prev = (window as unknown as { __formpilotPickers?: Array<() => void> }).__formpilotPickers;
prev?.forEach((fn) => fn());
```

Add the import for `computeSignatureFor` + `fillElement` if not present:

```typescript
import { computeSignatureFor } from '@/lib/capture/signature';
import { fillElement } from '@/lib/engine/heuristic/fillers';
```

- [ ] **Step 4: Wire the domain-pref toast**

Extend the `onSelect` callback to call a new helper that prompts via `ToolbarToast` (`components/capture/ToolbarToast.tsx`). The pattern: render a transient toast with three buttons (Remember / Once only / Cancel). For the first iteration, reuse the existing toast pattern (simplified choice via `confirm`):

Replace the `onSelect` above with:

```typescript
onSelect: async (cid) => {
  const picked = entry.candidates.find((c) => c.id === cid);
  if (!picked) return;
  const val = picked.displayValue && picked.displayValue.length > 0 ? picked.displayValue : picked.value;
  await fillElement(it.element, val, it.kind ?? entry.kind);
  chrome.runtime.sendMessage({
    type: 'BUMP_FORM_HIT', signature: sig, candidateId: cid, sourceUrl: window.location.href,
  });
  // Toast: remember on this domain?
  const alreadyPrompted = (window as unknown as { __formpilotPrompted?: Set<string> }).__formpilotPrompted ??=
    new Set<string>();
  const key = `${sig}:${currentDomain}`;
  if (alreadyPrompted.has(key)) return;
  alreadyPrompted.add(key);
  // Use native confirm for Phase A — replace with ToolbarToast UI later if noisy.
  // Intentionally skipping the "Once only" option in v1; Cancel is equivalent.
  const { resolveString } = await import('@/lib/i18n');
  const message = await resolveString(
    'candidate.domainPref.rememberToast',
    { domain: currentDomain, value: val },
  );
  if (window.confirm(message)) {
    chrome.runtime.sendMessage({
      type: 'SET_DOMAIN_PREF', signature: sig, domain: currentDomain, candidateId: cid,
    });
  }
}
```

`resolveString` is a new non-hook template resolver in `lib/i18n/index.ts`. Add it alongside the existing `t`:

```typescript
// lib/i18n/index.ts  — append near the existing dictionary exports
import { getSettings } from '@/lib/storage/settings-store';
import { zh } from './zh';
import { en } from './en';

/** Non-hook template lookup for use outside React (e.g. content script toasts). */
export async function resolveString(
  key: string,
  vars: Record<string, string> = {},
): Promise<string> {
  const { locale } = await getSettings();
  const dict = locale === 'en' ? en : zh;
  const raw = (dict as Record<string, string>)[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
```

- [ ] **Step 5: Build; load the extension; verify the picker appears**

```bash
pnpm run dev
```

Manual check: fill a form where one signature has ≥2 saved candidates; a small ▾ should appear to the right of each such field, and clicking it opens the popover.

- [ ] **Step 6: Commit**

```bash
git add components/capture/CandidatePicker.tsx components/capture/mount-candidate-picker.ts entrypoints/content.ts lib/i18n/index.ts
git commit -m "feat(capture): in-page candidate picker with pin / delete / domain-pref toast"
```

---

## Task 14: Manual QA + README notes

**Files:**
- Modify: `README.md` and `README.zh.md` (Features table + Architecture sketch)

- [ ] **Step 1: Update the Features table**

In both READMEs, add a row:

```
| **Multi-value form entries** (Phase 4 keeps all past answers; pin / domain override; in-page ▾ picker) | Done |
```

- [ ] **Step 2: Update the Architecture diagram**

Under the Storage block:

```
│  formpilot:formEntries     Cross-URL: candidates[] per signature │
│  formpilot:fieldDomainPrefs  Per-domain candidate override       │
```

(Trim the old line about single-value form entries.)

- [ ] **Step 3: Manual QA run — verify every scenario in the spec's manual checklist**

- Save 3 different values at 3 sites → 3 candidates, default = highest hitCount.
- Open the ▾ picker, switch, confirm, pick Remember → refresh → domain default changed.
- Delete the pinned candidate → pinnedId cleared; next fill uses hitCount default.
- Weak + old (hitCount=1, >30d) candidate gets GC'd on next touch.
- Checkbox entry: re-save with different value → still 1 candidate (hitCount resets to 1).
- Dashboard: edit a candidate value → id unchanged; pin/domain-pref references survive.
- Delete an entry with domain prefs → fieldDomainPrefs[signature] cleared.

Document any bugs in a new TODO or fix directly.

- [ ] **Step 4: Full test run + build**

```bash
pnpm run test
pnpm run build
```

- [ ] **Step 5: Commit**

```bash
git add README.md README.zh.md
git commit -m "docs: note multi-value form entries and domain prefs in README"
```

---

## Self-Review Notes

**Spec coverage audit:**

- [x] Data model — Tasks 2 + 6 (FormEntry schema, FieldDomainPrefs).
- [x] Cascade cleanup — Task 6 Step 4 (wires `clearPrefsPointingToCandidate` / `clearDomainPrefsForSignature` into delete paths).
- [x] Save path (append-or-bump, checkbox special) — Task 2 Step 3.
- [x] GC — Tasks 2 + 3.
- [x] Fill-time resolution — Task 7 (`resolveCandidate`).
- [x] `hitCount++` on selection — Task 7 (`bumpCandidateHit`) + Task 10 (content wiring) + Task 13 (picker wiring).
- [x] Domain-pref toast — Task 13 Step 4 (native `confirm` fallback; refine UI later).
- [x] Picker visibility rules (kind gate, `candidates >= 2`) — Task 13 Step 3.
- [x] Dashboard candidate editor — Task 12.
- [x] Background message routing — Task 9.
- [x] i18n — Task 11.
- [x] Tests — every task with code has matching failing-test-first steps.

**Known refinements for follow-up (outside Phase A scope):**

- Task 13's domain-pref prompt uses `window.confirm`, which is a usability downgrade vs. a styled ToolbarToast with three buttons (Remember / Once only / Cancel). The "Once only" option collapses into "Cancel" for v1. Upgrade to a Shadow-DOM toast component in Phase B alongside the Profile picker work.
- `OPEN_DASHBOARD` message with `focus: form-entry:${sig}` assumes the Dashboard honors a focus query param. If it does not today, the "Manage all candidates →" link will just open the tab; adding the scroll-into-view hook is a small follow-up.
- Picker positioning handles `scroll` / `resize`. On virtual-scroll pages or infinite-scroll surfaces the badge may drift relative to the field while the host layout shifts without firing window events. If it becomes an issue, upgrade to `ResizeObserver` + `IntersectionObserver`.

---

**Phase B seam (do not implement here):**

`CandidatePicker` takes `candidates: FieldCandidate[]` + callbacks — it is already decoupled from `FormEntry` / `form-store`. Phase B will reuse it for Profile fields (personal vs. work phone/email) by mapping a `Resume.basic.phones[]` array to the same component shape.

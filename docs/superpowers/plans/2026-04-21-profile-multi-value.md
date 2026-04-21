# Profile Multi-Value Implementation Plan (Phase B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Resume.basic.phone` and `Resume.basic.email` multi-candidate with pin + per-resume domain overrides, reusing Phase A's `CandidatePicker` and a refactored shared `resolveCandidate`.

**Architecture:** `FieldCandidate` moves to a shared module (`lib/capture/candidate.ts`); `resolveCandidate` is refactored to take `(candidates, pinnedId, domain, prefs)` so Phase A and Phase B call it identically. A new `profile-candidates.ts` helper owns upsert/add/update/delete/pin/hit over the active resume; a new `profile-domain-prefs-store.ts` mirrors Phase A's domain-prefs store but keys by `{resumeId → resumePath → domain}`. `orchestrateFill` widens to accept `profileDomainPrefs + currentDomain`; `getValueFromResume` dispatches `basic.phone`/`basic.email` through `resolveCandidate`. New Dashboard component `CandidateListField` edits candidates inline. Content-script extends the Phase A picker-mount loop to also mount pickers on Phase 2 multi-candidate fields.

**Tech Stack:** WXT / MV3, React 18, TypeScript, Tailwind, Vitest + jsdom. `crypto.randomUUID()` for ids. No new deps.

**Spec:** `docs/superpowers/specs/2026-04-21-profile-multi-value-design.md`

---

## File Map

| Path | Create / Modify | Responsibility |
|------|-----------------|----------------|
| `lib/capture/candidate.ts` | Create | Shared `FieldCandidate` + `resolveCandidate(candidates, pinnedId, domain, prefs)` + `candidateMatches`. Replaces defs previously in `form-store.ts`. |
| `lib/storage/form-store.ts` | Modify | Re-export from `candidate.ts`; update `resolveCandidate` call site (if any internal) |
| `lib/capture/form-phase.ts` | Modify | Call new `resolveCandidate(entry.candidates, entry.pinnedId, ...)` |
| `lib/storage/types.ts` | Modify | `BasicInfo.phone/email: FieldCandidate[]`, new `phonePinnedId/emailPinnedId`. Update `createEmptyResume`. |
| `lib/storage/resume-store.ts` | Modify | `deleteResume` cascade; `importResume` legacy-string wrap |
| `lib/storage/profile-candidates.ts` | Create | upsert/add/update/delete/setPin/bumpHit on active resume |
| `lib/storage/profile-domain-prefs-store.ts` | Create | per-resume profile domain prefs CRUD + cascade helpers |
| `lib/engine/orchestrator.ts` | Modify | `orchestrateFill` + `getValueFromResume` signatures; profile hits |
| `lib/engine/adapters/types.ts` | Modify | `FillResult.profileHits` |
| `entrypoints/background.ts` | Modify | 8 new messages; extend `GET_FILL_CONTEXT`; route `WRITE_BACK_TO_RESUME` profile paths to upsert |
| `entrypoints/content.ts` | Modify | Thread `profileDomainPrefs`; mount picker for `basic.phone`/`basic.email`; `BUMP_PROFILE_HIT` loop |
| `lib/import/resume-extractor.ts` | Modify | Emit candidate arrays for phone/email |
| `components/popup/CandidateListField.tsx` | Create | Multi-candidate inline editor used in BasicInfo |
| `components/popup/sections/BasicInfo.tsx` | Modify | Swap `<FormField>` → `<CandidateListField>` for phone/email |
| `lib/i18n/en.ts`, `lib/i18n/zh.ts` | Modify | New Profile-candidate keys |
| `README.md`, `README.zh.md` | Modify | Features table + storage diagram |
| `tests/lib/capture/candidate.test.ts` | Create | 7 `resolveCandidate` cases (moved from Phase A) + `candidateMatches` |
| `tests/lib/storage/profile-candidates.test.ts` | Create | Full API coverage, cascade |
| `tests/lib/storage/profile-domain-prefs-store.test.ts` | Create | CRUD + per-resume isolation + multi-match cleanup |
| `tests/lib/engine/orchestrator.test.ts` | Modify | Add Phase 2 multi-candidate + domain pref integration test |
| `tests/lib/capture/form-phase.test.ts` | Modify | `resolveCandidate` new signature (if tests assert on it); domain-pref test unchanged |
| `tests/lib/storage/resume-store.test.ts` | Modify | deleteResume cascade + importResume legacy-string wrap |

---

## Task 1: Extract `FieldCandidate` and `resolveCandidate` to a shared module

Moves the type + pure helpers out of `form-store.ts` so Phase B reuses them without importing from the storage layer. Refactors `resolveCandidate` to a parameterized signature.

**Files:**
- Create: `lib/capture/candidate.ts`
- Modify: `lib/storage/form-store.ts`
- Modify: `lib/capture/form-phase.ts`
- Create: `tests/lib/capture/candidate.test.ts`

- [ ] **Step 1: Create `lib/capture/candidate.ts`**

```typescript
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
```

- [ ] **Step 2: Add label field and re-export from `form-store.ts`**

Open `lib/storage/form-store.ts`. Remove the existing `FieldCandidate` interface, `candidateMatches` helper, and `resolveCandidate` function. Replace with re-exports at the top of the file, right after the other imports:

```typescript
import type { CapturedField, CapturedFieldKind } from '@/lib/capture/types';
import {
  WEAK_CANDIDATE_AGE_MS,
  WEAK_CANDIDATE_HIT_THRESHOLD,
} from '@/lib/capture/constants';
import {
  clearPrefsPointingToCandidate,
  clearDomainPrefsForSignature,
  clearAllFieldDomainPrefs,
} from './domain-prefs-store';
import {
  type FieldCandidate,
  candidateMatches,
  resolveCandidate,
} from '@/lib/capture/candidate';

// Re-export so existing external callers keep compiling unchanged.
export type { FieldCandidate } from '@/lib/capture/candidate';
export { resolveCandidate } from '@/lib/capture/candidate';
```

The `FormEntry` interface stays in `form-store.ts`. Any internal helper that used to reference the local `candidateMatches` now reads from the import. Any internal helper that called the old `resolveCandidate(entry, domain, prefs)` needs its signature flipped — there should be no internal callers (the function was exported for external use), but verify by grepping within `form-store.ts` after the change.

- [ ] **Step 3: Update the one external call site in `form-phase.ts`**

Open `lib/capture/form-phase.ts`. Find the line:

```typescript
const candidate = resolveCandidate(entry, currentDomain, domainPrefs[sig] ?? {});
```

Change to:

```typescript
const candidate = resolveCandidate(entry.candidates, entry.pinnedId, currentDomain, domainPrefs[sig] ?? {});
```

- [ ] **Step 4: Port the `resolveCandidate` tests to the new signature**

Create `tests/lib/capture/candidate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveCandidate, candidateMatches, type FieldCandidate } from '@/lib/capture/candidate';

function mk(partial: Partial<FieldCandidate>, i = 0): FieldCandidate {
  return {
    id: partial.id ?? `c${i}`,
    value: partial.value ?? `v${i}`,
    displayValue: partial.displayValue,
    label: partial.label,
    hitCount: partial.hitCount ?? 1,
    createdAt: partial.createdAt ?? 0,
    updatedAt: partial.updatedAt ?? 0,
    lastUrl: partial.lastUrl ?? '',
  };
}

describe('resolveCandidate', () => {
  it('picks domain pref first', () => {
    const cs = [mk({ id: 'a', hitCount: 10 }, 0), mk({ id: 'b', hitCount: 1 }, 1)];
    expect(resolveCandidate(cs, null, 'workday.com', { 'workday.com': 'b' })!.id).toBe('b');
  });

  it('falls through to pin when the domain pref points to a missing candidate', () => {
    const cs = [mk({ id: 'a', hitCount: 1 }, 0), mk({ id: 'b', hitCount: 10 }, 1)];
    expect(resolveCandidate(cs, 'a', 'workday.com', { 'workday.com': 'ghost' })!.id).toBe('a');
  });

  it('uses pin when there is no domain pref', () => {
    const cs = [mk({ id: 'a', hitCount: 1 }, 0), mk({ id: 'b', hitCount: 10 }, 1)];
    expect(resolveCandidate(cs, 'a', 'workday.com', {})!.id).toBe('a');
  });

  it('uses highest hitCount when there is no pin', () => {
    const cs = [mk({ id: 'a', hitCount: 1 }, 0), mk({ id: 'b', hitCount: 10 }, 1)];
    expect(resolveCandidate(cs, null, 'workday.com', {})!.id).toBe('b');
  });

  it('breaks hitCount ties by latest updatedAt', () => {
    const cs = [
      mk({ id: 'older', hitCount: 3, updatedAt: 100 }, 0),
      mk({ id: 'newer', hitCount: 3, updatedAt: 200 }, 1),
    ];
    expect(resolveCandidate(cs, null, 'workday.com', {})!.id).toBe('newer');
  });

  it('breaks further ties by earliest createdAt for stability', () => {
    const cs = [
      mk({ id: 'later', hitCount: 3, updatedAt: 100, createdAt: 50 }, 0),
      mk({ id: 'earlier', hitCount: 3, updatedAt: 100, createdAt: 10 }, 1),
    ];
    expect(resolveCandidate(cs, null, 'workday.com', {})!.id).toBe('earlier');
  });

  it('returns null for empty candidate list', () => {
    expect(resolveCandidate([], null, 'workday.com', {})).toBeNull();
  });
});

describe('candidateMatches', () => {
  it('matches on (value, displayValue) pair', () => {
    const c = mk({ value: 'a', displayValue: 'A' });
    expect(candidateMatches(c, 'a', 'A')).toBe(true);
    expect(candidateMatches(c, 'a', 'B')).toBe(false);
    expect(candidateMatches(c, 'b', 'A')).toBe(false);
  });

  it('treats undefined displayValue as empty string for comparison', () => {
    const c = mk({ value: 'a' });
    expect(candidateMatches(c, 'a', undefined)).toBe(true);
    expect(candidateMatches(c, 'a', '')).toBe(true);
  });
});
```

- [ ] **Step 5: Remove the duplicate `resolveCandidate` tests from the old location**

The Phase A tests `describe('resolveCandidate', ...)` in `tests/lib/storage/form-store.test.ts` (7 cases around lines 380–445) are now covered by the new test file. Delete that describe block AND its `mkEntry` helper (they're only used by those tests). Do NOT delete the `bumpCandidateHit` describe block right below — that stays.

- [ ] **Step 6: Run tests and build**

```bash
pnpm run test
pnpm run build
```

Expected: 189 tests pass (unchanged total — 7 moved, 2 new for `candidateMatches`, so net +2 = 191 actually). Build clean.

- [ ] **Step 7: Commit**

```bash
git add lib/capture/candidate.ts lib/storage/form-store.ts lib/capture/form-phase.ts \
        tests/lib/capture/candidate.test.ts tests/lib/storage/form-store.test.ts
git commit -m "refactor(candidate): extract FieldCandidate + resolveCandidate to shared module"
```

---

## Task 2: Schema change — `BasicInfo` goes multi-value

Changes the Resume type shape. This will break `BasicInfo.tsx` and the import parsers in the existing code; those break fixes come in later tasks. Tests that construct a default Resume will need updates.

**Files:**
- Modify: `lib/storage/types.ts`
- Modify: `lib/storage/resume-store.ts` (importResume legacy wrap)
- Modify: `tests/lib/storage/resume-store.test.ts` (update expected shape)

- [ ] **Step 1: Update the `BasicInfo` interface**

In `lib/storage/types.ts`, replace the existing `BasicInfo` interface with:

```typescript
import type { FieldCandidate } from '@/lib/capture/candidate';

export interface BasicInfo {
  name: string;
  nameEn: string;
  phone: FieldCandidate[];           // Phase B: multi-candidate
  phonePinnedId: string | null;      // Phase B
  email: FieldCandidate[];           // Phase B: multi-candidate
  emailPinnedId: string | null;      // Phase B
  gender: string;
  birthday: string;
  age: number;
  nationality: string;
  ethnicity: string;
  politicalStatus: string;
  location: string;
  willingLocations: string[];
  avatar: string;
  socialLinks: Record<string, string>;
}
```

- [ ] **Step 2: Update `createEmptyResume`**

In the same file, change the `basic` block of `createEmptyResume`:

```typescript
    basic: {
      name: '',
      nameEn: '',
      phone: [],
      phonePinnedId: null,
      email: [],
      emailPinnedId: null,
      gender: '',
      birthday: '',
      age: 0,
      nationality: '',
      ethnicity: '',
      politicalStatus: '',
      location: '',
      willingLocations: [],
      avatar: '',
      socialLinks: {},
    },
```

- [ ] **Step 3: Add the legacy-JSON wrap in `importResume`**

In `lib/storage/resume-store.ts`, find `importResume` (line 116). Before the `const resume: Resume = ...` construction, add:

```typescript
  // Legacy single-value schema compatibility: wrap string phone/email into
  // single-candidate arrays so old JSONs remain importable.
  if (parsed.basic && typeof parsed.basic === 'object') {
    const now = Date.now();
    if (typeof parsed.basic.phone === 'string') {
      const v = parsed.basic.phone;
      parsed.basic.phone = v
        ? [{ id: crypto.randomUUID(), value: v, label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '(imported)' }]
        : [];
      parsed.basic.phonePinnedId = null;
    }
    if (typeof parsed.basic.email === 'string') {
      const v = parsed.basic.email;
      parsed.basic.email = v
        ? [{ id: crypto.randomUUID(), value: v, label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '(imported)' }]
        : [];
      parsed.basic.emailPinnedId = null;
    }
  }
```

- [ ] **Step 4: Add tests for the import wrap**

In `tests/lib/storage/resume-store.test.ts`, add a describe block:

```typescript
describe('resume-store · importResume legacy schema', () => {
  it('wraps a legacy string phone into a single-candidate array', async () => {
    await chrome.storage.local.clear();
    const legacy = JSON.stringify({
      meta: { name: 'old' },
      basic: { phone: '138xxxxxxxx', email: '' },
    });
    const resume = await importResume(legacy);
    expect(Array.isArray(resume.basic.phone)).toBe(true);
    expect(resume.basic.phone).toHaveLength(1);
    expect(resume.basic.phone[0].value).toBe('138xxxxxxxx');
    expect(resume.basic.phone[0].hitCount).toBe(0);
    expect(resume.basic.phone[0].lastUrl).toBe('(imported)');
    expect(resume.basic.phonePinnedId).toBeNull();
    expect(resume.basic.email).toEqual([]);
    expect(resume.basic.emailPinnedId).toBeNull();
  });

  it('leaves already-array phone/email untouched', async () => {
    await chrome.storage.local.clear();
    const now = Date.now();
    const cand = { id: 'c1', value: 'a@b.com', label: 'p', hitCount: 2, createdAt: now, updatedAt: now, lastUrl: '' };
    const modern = JSON.stringify({
      meta: { name: 'new' },
      basic: { phone: [], email: [cand], phonePinnedId: null, emailPinnedId: 'c1' },
    });
    const resume = await importResume(modern);
    expect(resume.basic.email).toHaveLength(1);
    expect(resume.basic.email[0].id).toBe('c1');
    expect(resume.basic.emailPinnedId).toBe('c1');
  });
});
```

Remember to `import { importResume } from '@/lib/storage/resume-store'` at the top of the test file if not already there.

- [ ] **Step 5: Fix any existing resume-store test that constructs a Resume with string phone/email**

Run:

```bash
pnpm run test -- tests/lib/storage/resume-store.test.ts
```

Any existing test that builds a `BasicInfo` with `phone: 'string'` will fail type-check. Update each to use `phone: []`, `phonePinnedId: null`, `email: []`, `emailPinnedId: null`.

- [ ] **Step 6: Full suite — expect some failures in non-Phase-B places**

```bash
pnpm run test 2>&1 | tail -20
```

Expected failures in `tests/lib/engine/orchestrator.test.ts` (constructs Resume with old shape), possibly in writeback tests. Fix them minimally: replace old `phone: '138'` with `phone: [{ id: 'c1', value: '138', label: '', hitCount: 0, createdAt: 0, updatedAt: 0, lastUrl: '' }]` and `phonePinnedId: null` (same for email). If a test specifically checks single-value behavior it will need more rework — reserve that for Task 6 (orchestrator widening).

If the fill-oriented tests fail because `resume.basic.phone` is no longer a string and `getValueFromResume('basic.phone')` returns `.join(', ')` on the array, that's expected — it will be fixed in Task 6. Temporarily make them use a different path (e.g. `basic.name`) OR skip them with `it.skip` + a `TODO(Task 6)` comment, then un-skip in Task 6.

This is the one task where the TDD red-state cascade is allowed to persist; we're mid-refactor. Do not commit broken tests — either fix minimally or `it.skip` with a clear TODO.

- [ ] **Step 7: Build check**

```bash
pnpm run build
```

Build must pass. TypeScript errors in `BasicInfo.tsx` (which still reads `.phone` as string) will fail the build. Temporarily add a `// @ts-expect-error Phase B: BasicInfo.tsx fixed in Task 13` comment above each such line in `BasicInfo.tsx` if needed, with a TODO to clean it up.

Actually, a cleaner option: revert the BasicInfo FormField usage to the simplest possible form to keep it compiling. Something like:

```tsx
<FormField label={t('basic.phone')} value={data.phone[0]?.value ?? ''} onChange={() => {}} />
<FormField label={t('basic.email')} value={data.email[0]?.value ?? ''} onChange={() => {}} />
```

This is intentionally broken (onChange is a no-op) but keeps the build green. Add `// TODO(Task 13): replace with CandidateListField`. Swap for real in Task 13.

- [ ] **Step 8: Commit**

```bash
git add lib/storage/types.ts lib/storage/resume-store.ts \
        tests/lib/storage/resume-store.test.ts \
        components/popup/sections/BasicInfo.tsx
git commit -m "feat(types): BasicInfo.phone/email become FieldCandidate[] with pinnedId"
```

---

## Task 3: `profile-domain-prefs-store.ts`

Mirrors Phase A's `domain-prefs-store.ts` but with the 3-level key shape (`{ resumeId → path → domain → candidateId }`).

**Files:**
- Create: `lib/storage/profile-domain-prefs-store.ts`
- Create: `tests/lib/storage/profile-domain-prefs-store.test.ts`

- [ ] **Step 1: Write the failing test file**

```typescript
// tests/lib/storage/profile-domain-prefs-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  listForResume,
  setProfileDomainPref,
  clearProfileDomainPref,
  clearProfileDomainPrefsForPath,
  clearProfileDomainPrefsForResume,
  clearPrefsPointingToProfileCandidate,
  type ProfileCandidatePath,
} from '@/lib/storage/profile-domain-prefs-store';

const PATH: ProfileCandidatePath = 'basic.phone';

describe('profile-domain-prefs-store', () => {
  beforeEach(async () => {
    await chrome.storage.local.set({ 'formpilot:profileDomainPrefs': {} });
  });

  it('lists empty for an unknown resume', async () => {
    expect(await listForResume('r1')).toEqual({});
  });

  it('sets and reads a pref scoped to resume+path+domain', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    const prefs = await listForResume('r1');
    expect(prefs[PATH]['workday.com']).toBe('c1');
  });

  it('overwrites a pref on the same (resume, path, domain)', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c2');
    const prefs = await listForResume('r1');
    expect(prefs[PATH]['workday.com']).toBe('c2');
  });

  it('isolates per-resume prefs', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    await setProfileDomainPref('r2', PATH, 'workday.com', 'c9');
    expect((await listForResume('r1'))[PATH]['workday.com']).toBe('c1');
    expect((await listForResume('r2'))[PATH]['workday.com']).toBe('c9');
  });

  it('clearProfileDomainPref removes and prunes empty parents', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    await clearProfileDomainPref('r1', PATH, 'workday.com');
    expect(await listForResume('r1')).toEqual({});
  });

  it('clearProfileDomainPrefsForPath removes every domain for that path', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    await setProfileDomainPref('r1', PATH, 'lagou.com', 'c2');
    await setProfileDomainPref('r1', 'basic.email', 'workday.com', 'e1');
    await clearProfileDomainPrefsForPath('r1', PATH);
    const prefs = await listForResume('r1');
    expect(prefs[PATH]).toBeUndefined();
    expect(prefs['basic.email']).toEqual({ 'workday.com': 'e1' });
  });

  it('clearProfileDomainPrefsForResume removes the whole resume slice', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    await setProfileDomainPref('r2', PATH, 'workday.com', 'c9');
    await clearProfileDomainPrefsForResume('r1');
    expect(await listForResume('r1')).toEqual({});
    expect((await listForResume('r2'))[PATH]['workday.com']).toBe('c9');
  });

  it('clearPrefsPointingToProfileCandidate removes all matching domains', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'stale');
    await setProfileDomainPref('r1', PATH, 'greenhouse.io', 'stale');
    await setProfileDomainPref('r1', PATH, 'lagou.com', 'keep');
    await clearPrefsPointingToProfileCandidate('r1', PATH, 'stale');
    const prefs = await listForResume('r1');
    expect(prefs[PATH]).toEqual({ 'lagou.com': 'keep' });
  });
});
```

- [ ] **Step 2: Run — expect module-not-found errors**

```bash
pnpm run test -- tests/lib/storage/profile-domain-prefs-store.test.ts
```

- [ ] **Step 3: Implement the store**

```typescript
// lib/storage/profile-domain-prefs-store.ts

const KEY = 'formpilot:profileDomainPrefs';

export type ProfileCandidatePath = 'basic.phone' | 'basic.email';

/** resumeId → resumePath → domain → candidateId */
export type ProfileDomainPrefs = Record<string, Record<string, Record<string, string>>>;

async function readAll(): Promise<ProfileDomainPrefs> {
  const res = await chrome.storage.local.get(KEY);
  return (res[KEY] as ProfileDomainPrefs | undefined) ?? {};
}

async function writeAll(all: ProfileDomainPrefs): Promise<void> {
  await chrome.storage.local.set({ [KEY]: all });
}

/** Return the {path: {domain: candidateId}} slice for one resume. Empty object if unknown. */
export async function listForResume(
  resumeId: string,
): Promise<Record<string, Record<string, string>>> {
  const all = await readAll();
  return all[resumeId] ?? {};
}

export async function setProfileDomainPref(
  resumeId: string,
  path: ProfileCandidatePath,
  domain: string,
  candidateId: string,
): Promise<void> {
  const all = await readAll();
  if (!all[resumeId]) all[resumeId] = {};
  if (!all[resumeId][path]) all[resumeId][path] = {};
  all[resumeId][path][domain] = candidateId;
  await writeAll(all);
}

export async function clearProfileDomainPref(
  resumeId: string,
  path: ProfileCandidatePath,
  domain: string,
): Promise<void> {
  const all = await readAll();
  const r = all[resumeId];
  if (!r || !r[path]) return;
  delete r[path][domain];
  if (Object.keys(r[path]).length === 0) delete r[path];
  if (Object.keys(r).length === 0) delete all[resumeId];
  await writeAll(all);
}

export async function clearProfileDomainPrefsForPath(
  resumeId: string,
  path: ProfileCandidatePath,
): Promise<void> {
  const all = await readAll();
  const r = all[resumeId];
  if (!r || !r[path]) return;
  delete r[path];
  if (Object.keys(r).length === 0) delete all[resumeId];
  await writeAll(all);
}

export async function clearProfileDomainPrefsForResume(
  resumeId: string,
): Promise<void> {
  const all = await readAll();
  if (!all[resumeId]) return;
  delete all[resumeId];
  await writeAll(all);
}

/** Remove any (domain → candidateId) pair in this (resume, path) whose candidateId matches. */
export async function clearPrefsPointingToProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
): Promise<void> {
  const all = await readAll();
  const pathMap = all[resumeId]?.[path];
  if (!pathMap) return;
  for (const [domain, id] of Object.entries(pathMap)) {
    if (id === candidateId) delete pathMap[domain];
  }
  if (Object.keys(pathMap).length === 0) delete all[resumeId][path];
  if (all[resumeId] && Object.keys(all[resumeId]).length === 0) delete all[resumeId];
  await writeAll(all);
}
```

- [ ] **Step 4: Run — verify passing**

```bash
pnpm run test -- tests/lib/storage/profile-domain-prefs-store.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/storage/profile-domain-prefs-store.ts tests/lib/storage/profile-domain-prefs-store.test.ts
git commit -m "feat(profile): per-resume domain-pref store for profile candidates"
```

---

## Task 4: `profile-candidates.ts` API

Wraps the resume-store with candidate-aware mutation helpers: upsert, add, update, delete, setPin, bumpHit. Delete cascades to profileDomainPrefs.

**Files:**
- Create: `lib/storage/profile-candidates.ts`
- Create: `tests/lib/storage/profile-candidates.test.ts`

- [ ] **Step 1: Write the failing test file**

```typescript
// tests/lib/storage/profile-candidates.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createResume,
  getResume,
} from '@/lib/storage/resume-store';
import {
  upsertProfileCandidate,
  addProfileCandidate,
  updateProfileCandidate,
  deleteProfileCandidate,
  setProfilePin,
  bumpProfileCandidateHit,
} from '@/lib/storage/profile-candidates';
import {
  setProfileDomainPref,
  listForResume,
} from '@/lib/storage/profile-domain-prefs-store';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

async function newResumeId(): Promise<string> {
  const r = await createResume('t');
  return r.meta.id;
}

describe('profile-candidates · upsertProfileCandidate', () => {
  it('creates a new candidate when none exists', async () => {
    const id = await newResumeId();
    const { candidateId, bumped } = await upsertProfileCandidate(id, 'basic.phone', '138', 'https://a.com/');
    expect(candidateId).toMatch(/[0-9a-f-]{36}/i);
    expect(bumped).toBe(false);
    const r = await getResume(id);
    expect(r!.basic.phone).toHaveLength(1);
    expect(r!.basic.phone[0].value).toBe('138');
    expect(r!.basic.phone[0].hitCount).toBe(1);
    expect(r!.basic.phone[0].lastUrl).toBe('https://a.com/');
  });

  it('bumps hitCount on an existing value match', async () => {
    const id = await newResumeId();
    const first = await upsertProfileCandidate(id, 'basic.phone', '138', 'https://a.com/');
    const again = await upsertProfileCandidate(id, 'basic.phone', '138', 'https://b.com/');
    expect(again.candidateId).toBe(first.candidateId);
    expect(again.bumped).toBe(true);
    const r = await getResume(id);
    expect(r!.basic.phone).toHaveLength(1);
    expect(r!.basic.phone[0].hitCount).toBe(2);
    expect(r!.basic.phone[0].lastUrl).toBe('https://b.com/');
  });

  it('appends a new candidate when value differs', async () => {
    const id = await newResumeId();
    await upsertProfileCandidate(id, 'basic.phone', '138', 'https://a.com/');
    await upsertProfileCandidate(id, 'basic.phone', '150', 'https://b.com/');
    const r = await getResume(id);
    expect(r!.basic.phone).toHaveLength(2);
  });
});

describe('profile-candidates · addProfileCandidate', () => {
  it('adds with label and hitCount 0', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'Personal');
    expect(cid).not.toBeNull();
    const r = await getResume(id);
    const c = r!.basic.phone.find((x) => x.id === cid)!;
    expect(c.value).toBe('138');
    expect(c.label).toBe('Personal');
    expect(c.hitCount).toBe(0);
    expect(c.lastUrl).toBe('(manual)');
  });

  it('rejects a duplicate value', async () => {
    const id = await newResumeId();
    await addProfileCandidate(id, 'basic.phone', '138', 'A');
    const dup = await addProfileCandidate(id, 'basic.phone', '138', 'B');
    expect(dup).toBeNull();
    const r = await getResume(id);
    expect(r!.basic.phone).toHaveLength(1);
  });
});

describe('profile-candidates · updateProfileCandidate', () => {
  it('preserves id when editing value', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await updateProfileCandidate(id, 'basic.phone', cid!, '139', 'A');
    const r = await getResume(id);
    expect(r!.basic.phone[0].id).toBe(cid);
    expect(r!.basic.phone[0].value).toBe('139');
  });

  it('rejects an edit that duplicates another candidate', async () => {
    const id = await newResumeId();
    const a = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    const b = await addProfileCandidate(id, 'basic.phone', '150', 'B');
    await updateProfileCandidate(id, 'basic.phone', b!, '138', 'B');
    const r = await getResume(id);
    expect(r!.basic.phone.find((c) => c.id === b)!.value).toBe('150');
    void a;
  });
});

describe('profile-candidates · deleteProfileCandidate', () => {
  it('removes the candidate', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await deleteProfileCandidate(id, 'basic.phone', cid!);
    const r = await getResume(id);
    expect(r!.basic.phone).toHaveLength(0);
  });

  it('clears pinnedId when deleting the pinned candidate', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await setProfilePin(id, 'basic.phone', cid!);
    await deleteProfileCandidate(id, 'basic.phone', cid!);
    const r = await getResume(id);
    expect(r!.basic.phonePinnedId).toBeNull();
  });

  it('cascade-cleans profileDomainPrefs pointing to the deleted candidate', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await setProfileDomainPref(id, 'basic.phone', 'workday.com', cid!);
    await deleteProfileCandidate(id, 'basic.phone', cid!);
    const prefs = await listForResume(id);
    expect(prefs['basic.phone']).toBeUndefined();
  });
});

describe('profile-candidates · setProfilePin', () => {
  it('sets and clears pinnedId', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await setProfilePin(id, 'basic.phone', cid!);
    expect((await getResume(id))!.basic.phonePinnedId).toBe(cid);
    await setProfilePin(id, 'basic.phone', null);
    expect((await getResume(id))!.basic.phonePinnedId).toBeNull();
  });

  it('is a no-op for an unknown candidateId', async () => {
    const id = await newResumeId();
    await setProfilePin(id, 'basic.phone', 'ghost');
    expect((await getResume(id))!.basic.phonePinnedId).toBeNull();
  });
});

describe('profile-candidates · bumpProfileCandidateHit', () => {
  it('increments hitCount and updates lastUrl', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await bumpProfileCandidateHit(id, 'basic.phone', cid!, 'https://c.com/');
    const r = await getResume(id);
    const c = r!.basic.phone.find((x) => x.id === cid)!;
    expect(c.hitCount).toBe(1);
    expect(c.lastUrl).toBe('https://c.com/');
  });
});
```

- [ ] **Step 2: Run — expect failures**

```bash
pnpm run test -- tests/lib/storage/profile-candidates.test.ts
```

- [ ] **Step 3: Implement the helpers**

```typescript
// lib/storage/profile-candidates.ts
import { getResume, updateResume } from './resume-store';
import {
  clearPrefsPointingToProfileCandidate,
  clearProfileDomainPrefsForPath,
  type ProfileCandidatePath,
} from './profile-domain-prefs-store';
import { candidateMatches, type FieldCandidate } from '@/lib/capture/candidate';

export type { ProfileCandidatePath } from './profile-domain-prefs-store';

function pathArrayKey(path: ProfileCandidatePath): 'phone' | 'email' {
  return path === 'basic.phone' ? 'phone' : 'email';
}

function pathPinKey(path: ProfileCandidatePath): 'phonePinnedId' | 'emailPinnedId' {
  return path === 'basic.phone' ? 'phonePinnedId' : 'emailPinnedId';
}

function newCandidate(value: string, label: string, lastUrl: string, hitCount: number): FieldCandidate {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    value,
    label,
    hitCount,
    createdAt: now,
    updatedAt: now,
    lastUrl,
  };
}

/**
 * Save-to-Profile path: if the value matches an existing candidate, bump.
 * Otherwise append a new candidate with empty label and hitCount 1.
 */
export async function upsertProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  value: string,
  sourceUrl: string,
): Promise<{ candidateId: string; bumped: boolean }> {
  const resume = await getResume(resumeId);
  if (!resume) throw new Error(`Resume not found: ${resumeId}`);
  const arrKey = pathArrayKey(path);
  const candidates = resume.basic[arrKey];
  const match = candidates.find((c) => candidateMatches(c, value, undefined));
  if (match) {
    match.hitCount++;
    match.updatedAt = Date.now();
    match.lastUrl = sourceUrl;
    await updateResume(resumeId, { basic: resume.basic });
    return { candidateId: match.id, bumped: true };
  }
  const fresh = newCandidate(value, '', sourceUrl, 1);
  candidates.push(fresh);
  await updateResume(resumeId, { basic: resume.basic });
  return { candidateId: fresh.id, bumped: false };
}

/**
 * Manually add a candidate from the Dashboard. Rejects duplicate value.
 * Returns the new id, or null if rejected / unknown resume.
 */
export async function addProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  value: string,
  label: string,
): Promise<string | null> {
  const resume = await getResume(resumeId);
  if (!resume) return null;
  const arrKey = pathArrayKey(path);
  const candidates = resume.basic[arrKey];
  if (candidates.some((c) => candidateMatches(c, value, undefined))) return null;
  const fresh = newCandidate(value, label, '(manual)', 0);
  candidates.push(fresh);
  await updateResume(resumeId, { basic: resume.basic });
  return fresh.id;
}

/**
 * Edit a candidate's value and/or label. Id unchanged. Rejects duplicate value.
 */
export async function updateProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
  value: string,
  label: string,
): Promise<void> {
  const resume = await getResume(resumeId);
  if (!resume) return;
  const arrKey = pathArrayKey(path);
  const candidates = resume.basic[arrKey];
  const c = candidates.find((x) => x.id === candidateId);
  if (!c) return;
  if (candidates.some((x) => x.id !== candidateId && candidateMatches(x, value, undefined))) return;
  c.value = value;
  c.label = label;
  c.updatedAt = Date.now();
  await updateResume(resumeId, { basic: resume.basic });
}

/**
 * Remove a candidate and cascade-clean pin + domain prefs.
 */
export async function deleteProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
): Promise<void> {
  const resume = await getResume(resumeId);
  if (!resume) return;
  const arrKey = pathArrayKey(path);
  const pinKey = pathPinKey(path);
  const candidates = resume.basic[arrKey];
  const before = candidates.length;
  resume.basic[arrKey] = candidates.filter((c) => c.id !== candidateId);
  if (resume.basic[arrKey].length === before) return;  // no-op: not found
  if (resume.basic[pinKey] === candidateId) resume.basic[pinKey] = null;
  await updateResume(resumeId, { basic: resume.basic });
  await clearPrefsPointingToProfileCandidate(resumeId, path, candidateId);
}

export async function setProfilePin(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string | null,
): Promise<void> {
  const resume = await getResume(resumeId);
  if (!resume) return;
  const arrKey = pathArrayKey(path);
  const pinKey = pathPinKey(path);
  if (candidateId !== null && !resume.basic[arrKey].some((c) => c.id === candidateId)) return;
  resume.basic[pinKey] = candidateId;
  await updateResume(resumeId, { basic: resume.basic });
}

export async function bumpProfileCandidateHit(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
  sourceUrl: string,
): Promise<void> {
  const resume = await getResume(resumeId);
  if (!resume) return;
  const arrKey = pathArrayKey(path);
  const c = resume.basic[arrKey].find((x) => x.id === candidateId);
  if (!c) return;
  c.hitCount++;
  c.updatedAt = Date.now();
  c.lastUrl = sourceUrl;
  await updateResume(resumeId, { basic: resume.basic });
}

/**
 * Called by deleteResume cascade from resume-store.
 * Clears all profileDomainPrefs for the deleted resume.
 */
export async function purgeResumeProfilePrefs(resumeId: string): Promise<void> {
  const { clearProfileDomainPrefsForResume } = await import('./profile-domain-prefs-store');
  await clearProfileDomainPrefsForResume(resumeId);
  // clearProfileDomainPrefsForPath is not invoked here because the per-resume
  // sweep already removes everything under this resume.
  void clearProfileDomainPrefsForPath;
}
```

- [ ] **Step 4: Run — verify passing**

```bash
pnpm run test -- tests/lib/storage/profile-candidates.test.ts
```

Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/storage/profile-candidates.ts tests/lib/storage/profile-candidates.test.ts
git commit -m "feat(profile): upsert/add/update/delete/setPin/bumpHit for profile candidates"
```

---

## Task 5: `deleteResume` cascade

Ensures deleting a resume wipes its `profileDomainPrefs` slice.

**Files:**
- Modify: `lib/storage/resume-store.ts`
- Modify: `tests/lib/storage/resume-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/storage/resume-store.test.ts`:

```typescript
import {
  setProfileDomainPref,
  listForResume,
} from '@/lib/storage/profile-domain-prefs-store';

describe('resume-store · deleteResume cascades profile domain prefs', () => {
  it('removes the deleted resume\'s slice from profileDomainPrefs', async () => {
    await chrome.storage.local.clear();
    const r1 = await createResume('one');
    const r2 = await createResume('two');
    await setProfileDomainPref(r1.meta.id, 'basic.phone', 'workday.com', 'c1');
    await setProfileDomainPref(r2.meta.id, 'basic.phone', 'workday.com', 'c2');
    await deleteResume(r1.meta.id);
    expect(await listForResume(r1.meta.id)).toEqual({});
    expect((await listForResume(r2.meta.id))['basic.phone']['workday.com']).toBe('c2');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm run test -- tests/lib/storage/resume-store.test.ts
```

- [ ] **Step 3: Implement the cascade**

In `lib/storage/resume-store.ts`, update `deleteResume`:

```typescript
export async function deleteResume(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((r) => r.meta.id !== id));
  // Cascade: clean this resume's slice from profileDomainPrefs so it doesn't
  // accumulate stale entries over time.
  const { clearProfileDomainPrefsForResume } = await import('./profile-domain-prefs-store');
  await clearProfileDomainPrefsForResume(id);
}
```

- [ ] **Step 4: Run — verify passing**

```bash
pnpm run test -- tests/lib/storage/resume-store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/storage/resume-store.ts tests/lib/storage/resume-store.test.ts
git commit -m "feat(resume-store): deleteResume cascades to profileDomainPrefs"
```

---

## Task 6: Orchestrator + `getValueFromResume` widen

`orchestrateFill` gains `profileDomainPrefs` + `currentDomain` (Phase A already threaded `currentDomain` as a trailing default; extend with profileDomainPrefs). `getValueFromResume` gains a path-aware branch for `basic.phone` / `basic.email` that calls `resolveCandidate`. `FillResult.profileHits` is emitted when a profile candidate is used.

**Files:**
- Modify: `lib/engine/adapters/types.ts`
- Modify: `lib/engine/orchestrator.ts`
- Modify: `tests/lib/engine/orchestrator.test.ts`

- [ ] **Step 1: Extend `FillResult`**

In `lib/engine/adapters/types.ts`, add to the `FillResult` interface:

```typescript
  /** Phase 2 profile candidate selections — one per profile field that was filled from a multi-candidate array. */
  profileHits?: Array<{ resumePath: string; candidateId: string }>;
```

- [ ] **Step 2: Widen `getValueFromResume` and `orchestrateFill`**

In `lib/engine/orchestrator.ts`, replace the `getValueFromResume` function and `orchestrateFill` signature.

Add imports at top:

```typescript
import { resolveCandidate } from '@/lib/capture/candidate';
```

Replace `getValueFromResume`:

```typescript
/**
 * Resolve a dotted resume path to a string value.
 *
 * basic.phone / basic.email route through resolveCandidate — with currentDomain
 * and the active resume's profileDomainPrefs, a candidate is picked (domain pref
 * > pin > hitCount). Other paths resolve with the legacy dotted walk.
 *
 * Returns the picked candidate id via the `onProfilePick` callback so the
 * caller can later bump hitCount.
 */
export function getValueFromResume(
  resume: Resume,
  path: string,
  currentDomain: string = '',
  profileDomainPrefs: Record<string, Record<string, string>> = {},
  onProfilePick?: (resumePath: string, candidateId: string) => void,
): string {
  // Profile multi-value dispatch.
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
  if (Array.isArray(cursor)) return cursor.join(', ');
  return String(cursor);
}
```

Replace `orchestrateFill` signature and the value-resolution call:

```typescript
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
  // ... existing scanning code unchanged ...

  const profileHits: Array<{ resumePath: string; candidateId: string }> = [];

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

    // Note the new onProfilePick callback.
    const value = getValueFromResume(
      resume,
      s.resumePath,
      currentDomain,
      profileDomainPrefs,
      (path, candidateId) => { profileHits.push({ resumePath: path, candidateId }); },
    );
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

  // ... Phase 3 + Phase 4 blocks unchanged ...

  const filled = items.filter((i) => i.status === 'filled').length;
  const uncertain = items.filter((i) => i.status === 'uncertain').length;
  const unrecognized = items.filter((i) => i.status === 'unrecognized').length;
  return {
    items,
    filled,
    uncertain,
    unrecognized,
    formHits: /* existing logic */ undefined,   // keep as-is — handled in Phase A block
    profileHits: profileHits.length > 0 ? profileHits : undefined,
  };
}
```

**Important:** keep the existing Phase A formHits assignment in the Phase 4 block — do not lose it. Phase B's `profileHits` and Phase A's `formHits` are independent and both need to appear in the final return.

- [ ] **Step 3: Un-skip / fix any tests skipped in Task 2 Step 6**

Grep for `TODO(Task 6)` in the tests directory. Restore those tests, updating them to the new orchestrator signature if needed.

- [ ] **Step 4: Add a Phase 2 multi-candidate integration test**

In `tests/lib/engine/orchestrator.test.ts`, append:

```typescript
import type { FieldCandidate } from '@/lib/capture/candidate';

describe('orchestrateFill with profile multi-candidate', () => {
  it('picks a phone candidate via domain pref and emits profileHits', async () => {
    document.body.innerHTML = `<label for="p">手机</label><input id="p" name="phone">`;
    const el = document.getElementById('p') as HTMLInputElement;

    const now = Date.now();
    const c1: FieldCandidate = {
      id: 'personal', value: '138xxxxxxxx', label: '个人', hitCount: 10,
      createdAt: now, updatedAt: now, lastUrl: '',
    };
    const c2: FieldCandidate = {
      id: 'work', value: '150xxxxxxxx', label: '工作', hitCount: 1,
      createdAt: now, updatedAt: now, lastUrl: '',
    };
    const resume: Resume = createEmptyResume('r1', 'Test');
    resume.basic.phone = [c1, c2];
    resume.basic.phonePinnedId = null;

    const profileDomainPrefs: Record<string, Record<string, string>> = {
      'basic.phone': { 'workday.com': 'work' },
    };

    const result = await orchestrateFill(
      document, resume, null, [], {}, {}, 'workday.com', profileDomainPrefs,
    );
    expect(el.value).toBe('150xxxxxxxx');
    expect(result.profileHits).toEqual([{ resumePath: 'basic.phone', candidateId: 'work' }]);
  });
});
```

Add `import { createEmptyResume } from '@/lib/storage/types'` if not present.

- [ ] **Step 5: Run full suite — everything must be green**

```bash
pnpm run test
```

Previously skipped tests restored, new Phase 2 test passing, Phase A tests still green.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/adapters/types.ts lib/engine/orchestrator.ts tests/lib/engine/orchestrator.test.ts
git commit -m "feat(orchestrator): getValueFromResume dispatches profile multi-value; emits profileHits"
```

---

## Task 7: Split profile paths out of writeback

The Save-to-Profile path currently routes through `applyWriteback` in background. For `basic.phone` / `basic.email`, this would overwrite the entire array with a string. Route those two paths to `upsertProfileCandidate` instead.

**Files:**
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Rewrite the `WRITE_BACK_TO_RESUME` case**

Find the `WRITE_BACK_TO_RESUME` case in `entrypoints/background.ts`. Replace with:

```typescript
    case 'WRITE_BACK_TO_RESUME': {
      const { pairs, sourceUrl } = (message as unknown) as {
        pairs: { resumePath: string; value: string }[];
        sourceUrl?: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const resume = await getResume(id);
      if (!resume) return { ok: false, error: 'active resume not found' };

      // Split pairs: profile multi-value paths go through upsertProfileCandidate,
      // everything else through the legacy applyWriteback.
      const profilePaths = new Set(['basic.phone', 'basic.email']);
      const profilePairs = pairs.filter((p) => profilePaths.has(p.resumePath));
      const legacyPairs = pairs.filter((p) => !profilePaths.has(p.resumePath));

      const { upsertProfileCandidate } = await import('@/lib/storage/profile-candidates');
      for (const { resumePath, value } of profilePairs) {
        if (!value) continue;
        await upsertProfileCandidate(id, resumePath as 'basic.phone' | 'basic.email', value, sourceUrl ?? '');
      }

      if (legacyPairs.length > 0) {
        const updated = applyWriteback(resume, legacyPairs);
        const { meta: _m, ...patch } = updated;
        await updateResume(id, patch);
      }
      return { ok: true, data: { updated: pairs.length, name: resume.meta.name } };
    }
```

- [ ] **Step 2: Update content.ts to pass sourceUrl**

In `entrypoints/content.ts`, find the `WRITE_BACK_TO_RESUME` sendMessage call (inside `handleWriteback` or similar). Add `sourceUrl: window.location.href` to the message payload.

Example:

```typescript
const res = await chrome.runtime.sendMessage({
  type: 'WRITE_BACK_TO_RESUME',
  pairs,
  sourceUrl: window.location.href,   // <-- add
});
```

If there is no such call yet because it's wrapped in a helper, trace from the `handleWriteback` function and add sourceUrl at the sendMessage site.

- [ ] **Step 3: Full suite + build**

```bash
pnpm run test
pnpm run build
```

Must be green. Writeback-existing tests continue to pass because the legacy path is unchanged.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/background.ts entrypoints/content.ts
git commit -m "feat(writeback): route basic.phone/email through upsertProfileCandidate"
```

---

## Task 8: Background message routes

Adds the 8 new message types and extends `GET_FILL_CONTEXT`.

**Files:**
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Extend `GET_FILL_CONTEXT`**

Find the `GET_FILL_CONTEXT` handler (Phase A added `domainPrefs` here). Replace with:

```typescript
    case 'GET_FILL_CONTEXT': {
      const { memoryUrl, pageDomain } = (message as unknown) as {
        memoryUrl?: string;
        pageDomain?: string;
      };
      const id = await getActiveResumeId();
      const domainPrefsStore = await import('@/lib/storage/domain-prefs-store');
      const profileDomainPrefsStore = await import('@/lib/storage/profile-domain-prefs-store');
      const [resume, memory, formEntries, domainPrefs, profileDomainPrefs] = await Promise.all([
        id ? getResume(id) : Promise.resolve(null),
        memoryUrl ? memStore.getPageMemory(memoryUrl) : Promise.resolve([]),
        formStore.listFormEntries(),
        domainPrefsStore.listFieldDomainPrefs(),
        id ? profileDomainPrefsStore.listForResume(id) : Promise.resolve({}),
      ]);
      return {
        ok: true,
        data: {
          resume, memory, formEntries, domainPrefs,
          currentDomain: pageDomain ?? '',
          profileDomainPrefs,
        },
      };
    }
```

- [ ] **Step 2: Add 8 new message routes**

Add these cases inside the switch (after the Phase A form-entry messages):

```typescript
    case 'BUMP_PROFILE_HIT': {
      const { resumePath, candidateId, sourceUrl } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        candidateId: string;
        sourceUrl: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { bumpProfileCandidateHit } = await import('@/lib/storage/profile-candidates');
      await bumpProfileCandidateHit(id, resumePath, candidateId, sourceUrl);
      return { ok: true };
    }
    case 'SET_PROFILE_PIN': {
      const { resumePath, candidateId } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        candidateId: string | null;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { setProfilePin } = await import('@/lib/storage/profile-candidates');
      await setProfilePin(id, resumePath, candidateId);
      return { ok: true };
    }
    case 'ADD_PROFILE_CANDIDATE': {
      const { resumePath, value, label } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        value: string;
        label: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { addProfileCandidate } = await import('@/lib/storage/profile-candidates');
      const newId = await addProfileCandidate(id, resumePath, value, label);
      return { ok: true, data: { id: newId } };
    }
    case 'UPDATE_PROFILE_CANDIDATE': {
      const { resumePath, candidateId, value, label } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        candidateId: string;
        value: string;
        label: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { updateProfileCandidate } = await import('@/lib/storage/profile-candidates');
      await updateProfileCandidate(id, resumePath, candidateId, value, label);
      return { ok: true };
    }
    case 'DELETE_PROFILE_CANDIDATE': {
      const { resumePath, candidateId } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        candidateId: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { deleteProfileCandidate } = await import('@/lib/storage/profile-candidates');
      await deleteProfileCandidate(id, resumePath, candidateId);
      return { ok: true };
    }
    case 'SET_PROFILE_DOMAIN_PREF': {
      const { resumePath, domain, candidateId } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        domain: string;
        candidateId: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { setProfileDomainPref } = await import('@/lib/storage/profile-domain-prefs-store');
      await setProfileDomainPref(id, resumePath, domain, candidateId);
      return { ok: true };
    }
    case 'CLEAR_PROFILE_DOMAIN_PREF': {
      const { resumePath, domain } = (message as unknown) as {
        resumePath: 'basic.phone' | 'basic.email';
        domain: string;
      };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const { clearProfileDomainPref } = await import('@/lib/storage/profile-domain-prefs-store');
      await clearProfileDomainPref(id, resumePath, domain);
      return { ok: true };
    }
    case 'LIST_PROFILE_DOMAIN_PREFS': {
      const id = await getActiveResumeId();
      if (!id) return { ok: true, data: {} };
      const { listForResume } = await import('@/lib/storage/profile-domain-prefs-store');
      return { ok: true, data: await listForResume(id) };
    }
```

- [ ] **Step 3: Build + test**

```bash
pnpm run test
pnpm run build
```

- [ ] **Step 4: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat(background): route profile candidate / pin / domain-pref messages"
```

---

## Task 9: Content-script integration — pass profileDomainPrefs, bump hits, mount pickers

**Files:**
- Modify: `entrypoints/content.ts`

- [ ] **Step 1: Extend the `FillContext` interface**

Find the `FillContext` interface (Phase A added `domainPrefs: FieldDomainPrefs` and `currentDomain: string`). Replace:

```typescript
interface FillContext {
  resume: Resume | null;
  memory: PageMemoryEntry[];
  formEntries: Record<string, FormEntry>;
  domainPrefs: FieldDomainPrefs;
  currentDomain: string;
  profileDomainPrefs: Record<string, Record<string, string>>;
}
```

- [ ] **Step 2: Update `fetchFillContext` to unpack `profileDomainPrefs`**

Add this to the response unpack block:

```typescript
      return {
        resume: data.resume,
        memory: data.memory ?? [],
        formEntries: data.formEntries ?? {},
        domainPrefs: data.domainPrefs ?? {},
        currentDomain: data.currentDomain || currentDomain,
        profileDomainPrefs: data.profileDomainPrefs ?? {},
      };
```

And the empty-context fallback:

```typescript
  return {
    resume: null, memory: [], formEntries: {},
    domainPrefs: {}, currentDomain,
    profileDomainPrefs: {},
  };
```

- [ ] **Step 3: Pass `profileDomainPrefs` to `orchestrateFill` in `handleFill`**

```typescript
    const { resume, memory, formEntries, domainPrefs, currentDomain, profileDomainPrefs } = await fetchFillContext();
    // ...
    const result = await orchestrateFill(
      document, effectiveResume, adapter, memory, formEntries,
      domainPrefs, currentDomain, profileDomainPrefs,
    );
```

- [ ] **Step 4: Bump profile hits after fill**

After the existing `BUMP_FORM_HIT` loop, add:

```typescript
    const profileHits = result.profileHits ?? [];
    for (const hit of profileHits) {
      chrome.runtime.sendMessage({
        type: 'BUMP_PROFILE_HIT',
        resumePath: hit.resumePath,
        candidateId: hit.candidateId,
        sourceUrl: window.location.href,
      });
    }
```

- [ ] **Step 5: Extend the picker-mount loop**

Find the existing picker-mount loop (the `for (const it of result.items)` block that mounts pickers for `source === 'form'` items). Extend with a Phase 2 branch. Full replacement:

```typescript
  for (const it of result.items) {
    if (!it.element) continue;

    // Phase 4: signature-keyed form entries.
    if (it.source === 'form') {
      const sig = computeSignatureFor(it.element);
      const entry = formEntries[sig];
      if (!entry) continue;
      if (entry.kind === 'checkbox') continue;
      if (entry.candidates.length < 2) continue;
      const currentCandidateId = hits.find((h) => h.signature === sig)?.candidateId ?? null;
      mountFormPicker(it, entry, sig, currentCandidateId);  // existing helper / inline code
      continue;
    }

    // Phase 2: profile multi-value (basic.phone / basic.email).
    if (it.resumePath === 'basic.phone' || it.resumePath === 'basic.email') {
      if (!resume) continue;
      const rp = it.resumePath;
      const candidates = rp === 'basic.phone' ? resume.basic.phone : resume.basic.email;
      if (candidates.length < 2) continue;
      const currentCandidateId = profileHits.find((h) => h.resumePath === rp)?.candidateId ?? null;
      mountProfilePickerInline(it, rp, currentCandidateId);
    }
  }
```

The `mountFormPicker` extraction is cosmetic — if the existing code has it inline, leave it inline. The key addition is the second branch. The inline mount for the profile case:

```typescript
function mountProfilePickerInline(
  it: FillResultItem,
  resumePath: 'basic.phone' | 'basic.email',
  currentCandidateId: string | null,
) {
  if (!resume) return;
  // Hold mutable state on a single object so pin-toggle and delete
  // callbacks share their view across repeat invocations.
  const state = {
    candidates: resumePath === 'basic.phone' ? resume.basic.phone : resume.basic.email,
    pinnedId: resumePath === 'basic.phone' ? resume.basic.phonePinnedId : resume.basic.emailPinnedId,
  };

  let picker: MountedCandidatePicker;
  picker = mountCandidatePicker({
    target: it.element as Element,
    signature: `profile:${resumePath}`,
    candidates: state.candidates,
    pinnedId: state.pinnedId,
    currentCandidateId,
    t,
    onSelect: async (cid) => {
      const picked = state.candidates.find((c) => c.id === cid);
      if (!picked) return;
      try { await fillElement(it.element as Element, picked.value, 'text'); } catch { /* ignore */ }
      chrome.runtime.sendMessage({
        type: 'BUMP_PROFILE_HIT',
        resumePath, candidateId: cid,
        sourceUrl: window.location.href,
      });
      const promptKey = `profile:${resumePath}:${currentDomain}`;
      if (!promptedDomainPrefs.has(promptKey)) {
        promptedDomainPrefs.add(promptKey);
        const msg = t('candidate.domainPref.rememberToast', {
          domain: currentDomain,
          value: picked.label ?? picked.value,
        });
        if (window.confirm(msg)) {
          chrome.runtime.sendMessage({
            type: 'SET_PROFILE_DOMAIN_PREF',
            resumePath, domain: currentDomain, candidateId: cid,
          });
        }
      }
    },
    onPinToggle: async (cid) => {
      const next = state.pinnedId === cid ? null : cid;
      await chrome.runtime.sendMessage({ type: 'SET_PROFILE_PIN', resumePath, candidateId: next });
      state.pinnedId = next;
      picker.update({ pinnedId: next });
    },
    onDelete: async (cid) => {
      await chrome.runtime.sendMessage({ type: 'DELETE_PROFILE_CANDIDATE', resumePath, candidateId: cid });
      const idx = state.candidates.findIndex((c) => c.id === cid);
      if (idx >= 0) state.candidates.splice(idx, 1);
      if (state.pinnedId === cid) state.pinnedId = null;
      picker.update({ candidates: state.candidates, pinnedId: state.pinnedId });
      if (state.candidates.length < 2) {
        const mIdx = mountedPickers.indexOf(picker);
        if (mIdx >= 0) mountedPickers.splice(mIdx, 1);
        picker.unmount();
      }
    },
    onManageAll: () => {
      const url = chrome.runtime.getURL('/dashboard.html') + '#basic';
      window.open(url, '_blank');
    },
  });
  mountedPickers.push(picker);
}
```

Place this function near the existing Phase A picker-mount helper. If the Phase A code is inline (not extracted), extract both into small helper functions to keep `handleFill` readable — otherwise the block becomes very long.

Ensure `FieldCandidate` is imported at the top: `import type { FieldCandidate } from '@/lib/capture/candidate';`.

- [ ] **Step 6: Build + full suite**

```bash
pnpm run test
pnpm run build
```

All green. Tests cover the orchestrator path and profile-candidates store; the content-script wiring is exercised manually (no headless test harness in this repo).

- [ ] **Step 7: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat(content): thread profileDomainPrefs, bump profile hits, mount picker for basic.phone/email"
```

---

## Task 10: PDF/Word extractor emits candidate arrays

**Files:**
- Modify: `lib/import/resume-extractor.ts`

- [ ] **Step 1: Update extractor output**

Open `lib/import/resume-extractor.ts`. Find where `{ basic: { name, email, phone } }` is assembled (around line 70 and the caller around line 227–229).

At line 70 area, change the shape: the extractor already produces strings internally; the `Partial<Resume>` assembly (at line 227 area) needs to wrap them.

Add a helper near the top of the file:

```typescript
import type { FieldCandidate } from '@/lib/capture/candidate';

function wrapAsImportedCandidate(value: string): FieldCandidate[] {
  if (!value) return [];
  const now = Date.now();
  return [{
    id: crypto.randomUUID(),
    value,
    label: '',
    hitCount: 0,
    createdAt: now,
    updatedAt: now,
    lastUrl: '(imported)',
  }];
}
```

Then at the site where `Partial<Resume>` is assembled for the return (around lines 225–235 based on the earlier grep), replace:

```typescript
      name: extracted.basic.name,
      email: extracted.basic.email,
      phone: extracted.basic.phone,
```

with:

```typescript
      name: extracted.basic.name,
      email: wrapAsImportedCandidate(extracted.basic.email),
      emailPinnedId: null,
      phone: wrapAsImportedCandidate(extracted.basic.phone),
      phonePinnedId: null,
```

If the caller's type annotation was `Partial<BasicInfo>`, the new shape fits. If there's a custom local type, update it to match.

- [ ] **Step 2: Update any extractor test**

```bash
pnpm run test -- tests/lib/import/
```

Any test that asserts `result.basic.phone === '138xxx'` now must assert on `result.basic.phone[0].value === '138xxx'`. Update minimally.

- [ ] **Step 3: Build + full suite**

```bash
pnpm run test
pnpm run build
```

- [ ] **Step 4: Commit**

```bash
git add lib/import/resume-extractor.ts tests/lib/import/
git commit -m "feat(import): PDF/Word extractor emits candidate arrays for phone/email"
```

---

## Task 11: i18n strings

**Files:**
- Modify: `lib/i18n/en.ts`
- Modify: `lib/i18n/zh.ts`

- [ ] **Step 1: Add English keys**

In `lib/i18n/en.ts`, append before the closing `};`:

```typescript
  // ── Profile multi-value (Phase B) ─────────────────────────────
  'profile.candidate.add': '+ Add',
  'profile.candidate.labelPlaceholder': 'Label (Personal / Work)',
  'profile.candidate.valuePlaceholder.phone': 'Phone number',
  'profile.candidate.valuePlaceholder.email': 'Email address',
  'profile.candidate.noCandidates': 'Not set',
  'profile.candidate.save': 'Save',
  'profile.candidate.cancel': 'Cancel',
```

- [ ] **Step 2: Add Chinese keys**

In `lib/i18n/zh.ts`, append before the closing `};`:

```typescript
  // ── Profile 多值候选（Phase B）─────────────────────────────
  'profile.candidate.add': '+ 新增',
  'profile.candidate.labelPlaceholder': '标签（个人/工作）',
  'profile.candidate.valuePlaceholder.phone': '手机号',
  'profile.candidate.valuePlaceholder.email': '邮箱',
  'profile.candidate.noCandidates': '未填写',
  'profile.candidate.save': '保存',
  'profile.candidate.cancel': '取消',
```

- [ ] **Step 3: Commit**

```bash
git add lib/i18n/en.ts lib/i18n/zh.ts
git commit -m "i18n: profile-candidate keys (en + zh)"
```

---

## Task 12: `CandidateListField` component

**Files:**
- Create: `components/popup/CandidateListField.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/popup/CandidateListField.tsx
import React, { useState } from 'react';
import type { FieldCandidate } from '@/lib/capture/candidate';
import { useI18n } from '@/lib/i18n';

export interface CandidateListFieldProps {
  label: string;
  candidates: FieldCandidate[];
  pinnedId: string | null;
  domainPrefs: Record<string, string>;
  valueInputPlaceholder: string;
  onAdd: (value: string, label: string) => void;
  onUpdate: (id: string, value: string, label: string) => void;
  onDelete: (id: string) => void;
  onSetPin: (id: string | null) => void;
  onClearDomainPref: (domain: string) => void;
}

/** Tiebreak sort matching resolveCandidate's step 3-5 (no domain, no pin context). */
function pickDefault(candidates: FieldCandidate[], pinnedId: string | null): FieldCandidate | null {
  if (candidates.length === 0) return null;
  if (pinnedId) {
    const p = candidates.find((c) => c.id === pinnedId);
    if (p) return p;
  }
  return [...candidates].sort((a, b) => {
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.createdAt - b.createdAt;
  })[0];
}

export default function CandidateListField({
  label, candidates, pinnedId, domainPrefs,
  valueInputPlaceholder,
  onAdd, onUpdate, onDelete, onSetPin, onClearDomainPref,
}: CandidateListFieldProps) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');

  const def = pickDefault(candidates, pinnedId);

  const resetAdd = () => { setAdding(false); setAddValue(''); setAddLabel(''); };
  const submitAdd = () => {
    if (!addValue.trim()) return;
    onAdd(addValue.trim(), addLabel.trim());
    resetAdd();
  };
  const beginEdit = (c: FieldCandidate) => {
    setEditingId(c.id);
    setEditValue(c.value);
    setEditLabel(c.label ?? '');
  };
  const submitEdit = (id: string) => {
    if (!editValue.trim()) return;
    onUpdate(id, editValue.trim(), editLabel.trim());
    setEditingId(null);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-500">{label}</label>
        {!adding && (
          <button
            className="text-xs text-blue-400 hover:text-blue-300"
            onClick={() => setAdding(true)}
          >
            {t('profile.candidate.add')}
          </button>
        )}
      </div>

      {candidates.length === 0 && !adding && (
        <div className="text-xs text-gray-500 italic">
          {t('profile.candidate.noCandidates')}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="space-y-1 bg-gray-900 border border-gray-800 rounded p-1">
          {candidates.map((c) => {
            const isEditing = editingId === c.id;
            const isDefault = def?.id === c.id;
            const isPinned = pinnedId === c.id;
            return (
              <div key={c.id} className="flex items-start gap-2 text-xs py-1 px-1">
                {!isEditing && (
                  <span className="text-gray-500 mt-0.5">{isDefault ? '●' : '○'}</span>
                )}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-1">
                      <input
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                        value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        placeholder={valueInputPlaceholder}
                      />
                      <input
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                        value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                        placeholder={t('profile.candidate.labelPlaceholder')}
                      />
                      <div className="flex gap-2">
                        <button className="text-blue-400" onClick={() => submitEdit(c.id)}>
                          {t('profile.candidate.save')}
                        </button>
                        <button className="text-gray-400" onClick={() => setEditingId(null)}>
                          {t('profile.candidate.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-gray-200 break-all">{c.value}</div>
                      {c.label && <div className="text-gray-500">{c.label}</div>}
                    </>
                  )}
                </div>
                {!isEditing && (
                  <div className="flex gap-2 shrink-0 text-gray-400">
                    <button
                      title={isPinned ? 'Unpin' : 'Pin'}
                      onClick={() => onSetPin(isPinned ? null : c.id)}
                    >{isPinned ? '★' : '☆'}</button>
                    <button title="Edit" onClick={() => beginEdit(c)}>✎</button>
                    <button
                      title="Delete"
                      onClick={() => onDelete(c.id)}
                      className="text-red-400 hover:text-red-300"
                    >🗑</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="mt-1 space-y-1 bg-gray-900 border border-gray-800 rounded p-2">
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
            value={addValue} onChange={(e) => setAddValue(e.target.value)}
            placeholder={valueInputPlaceholder}
            autoFocus
          />
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
            value={addLabel} onChange={(e) => setAddLabel(e.target.value)}
            placeholder={t('profile.candidate.labelPlaceholder')}
          />
          <div className="flex gap-2 text-xs">
            <button className="text-blue-400" onClick={submitAdd}>
              {t('profile.candidate.save')}
            </button>
            <button className="text-gray-400" onClick={resetAdd}>
              {t('profile.candidate.cancel')}
            </button>
          </div>
        </div>
      )}

      {Object.keys(domainPrefs).length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-800 text-xs">
          <div className="text-gray-500 mb-1">
            {/* Reuse the Phase A dashboard key for consistency. */}
            Domain overrides
          </div>
          <div className="space-y-1">
            {Object.entries(domainPrefs).map(([domain, candidateId]) => {
              const c = candidates.find((x) => x.id === candidateId);
              return (
                <div key={domain} className="flex items-center justify-between">
                  <span className="text-gray-300">
                    {domain} → {c ? (c.label ? `${c.value} (${c.label})` : c.value) : '(missing)'}
                  </span>
                  <button
                    className="text-red-400 hover:text-red-300"
                    title="Clear"
                    onClick={() => onClearDomainPref(domain)}
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

- [ ] **Step 2: Build**

```bash
pnpm run build
```

Must compile. (No tests at this stage — component is exercised via BasicInfo integration.)

- [ ] **Step 3: Commit**

```bash
git add components/popup/CandidateListField.tsx
git commit -m "feat(dashboard): CandidateListField component for profile multi-value editor"
```

---

## Task 13: BasicInfo.tsx wires in `CandidateListField`

**Files:**
- Modify: `components/popup/sections/BasicInfo.tsx`

- [ ] **Step 1: Import and load domain prefs**

Top of file, add imports:

```tsx
import CandidateListField from '../CandidateListField';
import { useEffect, useState } from 'react';
```

Inside `BasicInfoSection`, before the `return`:

```typescript
  const [profileDomainPrefs, setProfileDomainPrefs] = useState<Record<string, Record<string, string>>>({});

  const refreshPrefs = async () => {
    const res = await chrome.runtime.sendMessage({ type: 'LIST_PROFILE_DOMAIN_PREFS' });
    setProfileDomainPrefs(res?.ok ? (res.data as Record<string, Record<string, string>>) : {});
  };
  useEffect(() => { refreshPrefs(); }, []);

  const runMessage = async (msg: Record<string, unknown>) => {
    await chrome.runtime.sendMessage(msg);
    // Triggers parent to refresh the Resume via existing data flow; also refresh local prefs.
    refreshPrefs();
    // The parent's onChange prop is how Resume updates propagate — we invoke it with no patch
    // to trigger a re-fetch, OR we could request the updated Resume ourselves. Simpler: the
    // Dashboard's parent listens for storage changes and re-fetches; if that isn't in place,
    // call onChange({ /* noop */ }) to force a render cycle. See Step 3.
  };
```

- [ ] **Step 2: Replace the phone and email `<FormField>` blocks**

Find the two `<FormField>` blocks for `basic.phone` (around the line matching `label={t('basic.phone')}`) and `basic.email`. Replace BOTH with:

```tsx
        <CandidateListField
          label={t('basic.phone')}
          candidates={data.phone}
          pinnedId={data.phonePinnedId}
          domainPrefs={profileDomainPrefs['basic.phone'] ?? {}}
          valueInputPlaceholder={t('profile.candidate.valuePlaceholder.phone')}
          onAdd={async (value, label) => {
            await chrome.runtime.sendMessage({ type: 'ADD_PROFILE_CANDIDATE', resumePath: 'basic.phone', value, label });
            await refreshFromStorage();
          }}
          onUpdate={async (id, value, label) => {
            await chrome.runtime.sendMessage({ type: 'UPDATE_PROFILE_CANDIDATE', resumePath: 'basic.phone', candidateId: id, value, label });
            await refreshFromStorage();
          }}
          onDelete={async (id) => {
            await chrome.runtime.sendMessage({ type: 'DELETE_PROFILE_CANDIDATE', resumePath: 'basic.phone', candidateId: id });
            await refreshFromStorage();
            await refreshPrefs();
          }}
          onSetPin={async (id) => {
            await chrome.runtime.sendMessage({ type: 'SET_PROFILE_PIN', resumePath: 'basic.phone', candidateId: id });
            await refreshFromStorage();
          }}
          onClearDomainPref={async (domain) => {
            await chrome.runtime.sendMessage({ type: 'CLEAR_PROFILE_DOMAIN_PREF', resumePath: 'basic.phone', domain });
            await refreshPrefs();
          }}
        />
        <CandidateListField
          label={t('basic.email')}
          candidates={data.email}
          pinnedId={data.emailPinnedId}
          domainPrefs={profileDomainPrefs['basic.email'] ?? {}}
          valueInputPlaceholder={t('profile.candidate.valuePlaceholder.email')}
          onAdd={async (value, label) => {
            await chrome.runtime.sendMessage({ type: 'ADD_PROFILE_CANDIDATE', resumePath: 'basic.email', value, label });
            await refreshFromStorage();
          }}
          onUpdate={async (id, value, label) => {
            await chrome.runtime.sendMessage({ type: 'UPDATE_PROFILE_CANDIDATE', resumePath: 'basic.email', candidateId: id, value, label });
            await refreshFromStorage();
          }}
          onDelete={async (id) => {
            await chrome.runtime.sendMessage({ type: 'DELETE_PROFILE_CANDIDATE', resumePath: 'basic.email', candidateId: id });
            await refreshFromStorage();
            await refreshPrefs();
          }}
          onSetPin={async (id) => {
            await chrome.runtime.sendMessage({ type: 'SET_PROFILE_PIN', resumePath: 'basic.email', candidateId: id });
            await refreshFromStorage();
          }}
          onClearDomainPref={async (domain) => {
            await chrome.runtime.sendMessage({ type: 'CLEAR_PROFILE_DOMAIN_PREF', resumePath: 'basic.email', domain });
            await refreshPrefs();
          }}
        />
```

Remove the temporary `onChange={() => {}}` FormField blocks from Task 2 Step 7.

- [ ] **Step 3: Wire `refreshFromStorage`**

The existing Dashboard uses a `onChange: (patch) => {}` prop that propagates changes upward. After a `chrome.runtime.sendMessage`, the store has changed but the parent's local state still reflects the stale Resume.

Open `entrypoints/dashboard/App.tsx` (the Dashboard parent). Find where `BasicInfoSection` is rendered with `data` and `onChange`. Add a `refreshFromStorage` prop that re-fetches the active resume:

```tsx
<BasicInfoSection
  data={resume.basic}
  onChange={handleBasicChange}
  refreshFromStorage={async () => {
    const res = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_RESUME' });
    if (res?.ok && res.data) setResume(res.data as Resume);
  }}
/>
```

Update `BasicInfoProps`:

```typescript
interface BasicInfoProps {
  data: BasicInfo;
  onChange: (patch: Partial<BasicInfo>) => void;
  refreshFromStorage: () => Promise<void>;
}
```

And destructure it in the component: `export default function BasicInfoSection({ data, onChange, refreshFromStorage }: BasicInfoProps) { ... }`.

- [ ] **Step 4: Build + visual check**

```bash
pnpm run build
pnpm run dev
```

Manually load the extension, open Dashboard → Basic Info, verify:
- Empty phone/email shows "Not set"
- Add a candidate with label → appears in list with ○ dot
- Add a second candidate → first becomes ● (default by hitCount fallback)
- Pin the second → ★ moves to it, ● moves with it
- Edit a candidate value → saves, id preserved (verify in storage)
- Delete a candidate → row disappears
- Add a domain override via the in-page picker (not directly here) → "Domain overrides" sub-block appears on next refresh with a clear button

- [ ] **Step 5: Commit**

```bash
git add components/popup/sections/BasicInfo.tsx entrypoints/dashboard/App.tsx
git commit -m "feat(dashboard): BasicInfo uses CandidateListField for phone/email"
```

---

## Task 14: README updates

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`

- [ ] **Step 1: Update Features table (English)**

Add a new row to `README.md`'s Features table, below the existing Phase A row:

```
| **Profile multi-value** (`basic.phone` / `basic.email` keep multiple candidates; pin / per-resume domain override; in-page ▾ picker on profile-filled fields) | Done |
```

- [ ] **Step 2: Update Storage diagram (English)**

Add a new line to the Storage ASCII box:

```
│  formpilot:profileDomainPrefs   Per-resume profile-field domain overrides │
```

Keep column widths aligned with the other Storage rows.

- [ ] **Step 3: Mirror both changes in `README.zh.md`**

Chinese Features row:

```
| **Profile 多值**（`basic.phone` / `basic.email` 多候选；可 pin / 按域名覆盖（按简历分）；页面内 ▾ 选择器） | Done |
```

Chinese Storage row:

```
│  formpilot:profileDomainPrefs   每份简历的 Profile 字段域名覆盖记录    │
```

- [ ] **Step 4: Commit**

```bash
git add README.md README.zh.md
git commit -m "$(cat <<'EOF'
docs: READMEs — profile multi-value (Phase B)

Phase B adds multi-candidate phone and email on Resume.basic, with
per-resume domain overrides and reuse of the Phase A in-page picker.

Manual QA checklist:
- Dashboard: add 2 phone candidates with labels, pin one, ★ moves to it.
- Visit a site with a phone field: ▾ picker shows; switch → toast → Remember → revisit domain with same resume, new default.
- Switch active resume on a reloaded page: picker shows the new resume's candidates.
- Delete a resume: its profileDomainPrefs entry is removed.
- Import a legacy JSON with basic.phone: "138...": wraps into a single-candidate array.
- PDF import: parsed phone becomes one candidate; Fill doesn't show ▾ (only 1 candidate).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage audit:**

- [x] §Data Model → Task 1 (shared type), Task 2 (BasicInfo), Task 3 (domain-prefs store)
- [x] §Candidate Lifecycle → Task 4 (upsert/add/update/delete/setPin/bumpHit)
- [x] §Fill-Time Resolution → Task 1 (refactored resolveCandidate), Task 6 (getValueFromResume dispatch)
- [x] §Storage Layer API → Tasks 3, 4
- [x] §Dashboard UI (CandidateListField) → Tasks 12, 13
- [x] §In-Page ▾ Picker → Task 9 (content-script integration)
- [x] §Background Message Routes → Task 8
- [x] §Import/Export — PDF/Word → Task 10; JSON legacy wrap → Task 2
- [x] §i18n → Task 11
- [x] §Testing → candidate.test.ts (Task 1), profile-domain-prefs-store.test.ts (Task 3), profile-candidates.test.ts (Task 4), orchestrator.test.ts Phase 2 test (Task 6), resume-store.test.ts cascade (Task 5 + Task 2's import wrap)
- [x] §Non-Goals — no tasks for `location`, `socialLinks`, GC, cross-resume sharing, domain prefs in JSON export, dashboard deep-link polish

**Placeholder scan:** no `TODO` / `TBD` / "implement later" inside code blocks. (Task 6 Step 3 references `TODO(Task 6)` but that's a comment-marker cleanup step, not a placeholder in new code.)

**Type consistency:**
- `FieldCandidate` signature identical across Tasks 1, 4, 6, 9, 12
- `ProfileCandidatePath = 'basic.phone' | 'basic.email'` across Tasks 3, 4, 8
- `resolveCandidate(candidates, pinnedId, currentDomain, domainPrefs)` signature consistent in Tasks 1, 6
- `BUMP_PROFILE_HIT` payload (`resumePath, candidateId, sourceUrl`) consistent in Tasks 8, 9
- `FillResult.profileHits?: Array<{resumePath; candidateId}>` consistent in Tasks 6, 9

**Known deferred to post-Phase-B:**
- Manage-all deep-link (`dashboard.html#basic` does not scroll to candidate)
- JSON export inclusion of `profileDomainPrefs` (per-device concern)
- Dashboard drag-to-reorder candidates
- Phase B.1: `location` multi-value after new `hometown` path is added

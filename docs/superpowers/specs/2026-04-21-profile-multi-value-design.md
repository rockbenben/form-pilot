# Profile Multi-Value Design (Phase B)

**Date:** 2026-04-21
**Scope:** `Resume.basic.phone` and `Resume.basic.email` become multi-candidate. Per-domain override, global pin, and the in-page ▾ picker from Phase A extend to Profile-filled (Phase 2) fields. Other Profile fields stay single-value.
**Depends on:** Phase A (`docs/superpowers/specs/2026-04-21-form-entries-multi-value-design.md` — shipped at commit `b2217e8`).
**Excluded from Phase B:** `location` (semantic collision — separate Profile paths for 籍贯/现居 are not yet modeled), `socialLinks` (rare use case), education/work/projects entries (already arrays by design), Profile-candidate GC (user-managed), JSON export of domain prefs (deferred).

## Problem

Users repeatedly fill job applications with one of several phone numbers (personal / work / backup) and one of several emails (personal / work / school). Today `Resume.basic.phone: string` and `Resume.basic.email: string` hold exactly one value; switching at a given site means editing the profile or copy-pasting. The feature gap is symmetric with Phase A's cross-URL form entries, but applied to strongly-typed Profile fields instead of signature-keyed captures.

## Goal

Each user can maintain multiple candidate phone numbers and email addresses per resume, pin a global default, override per domain, and switch per field via the in-page ▾ picker shipped in Phase A. PDF/Word import, JSON import/export, Dashboard editor, Save-to-Profile, and the Phase 2 fill pipeline all preserve the new semantics.

This is a brand-new extension — there is no migration layer from a live user base. The only backward-compat handling is a minimal string-→-array wrap inside JSON import, for JSONs authored under the old single-value schema.

## Data Model

### Shared type change: `FieldCandidate` gains an optional `label`

```typescript
// lib/capture/candidate.ts (new file — see §4 for the move)
export interface FieldCandidate {
  id: string;
  value: string;
  displayValue?: string;  // Phase A: radio/select visible option text
  label?: string;         // Phase B: user-assigned tag ("个人" / "工作" / "备用")
  hitCount: number;
  createdAt: number;
  updatedAt: number;
  lastUrl: string;
}
```

Picker display rule: `label ?? displayValue ?? value`.

### `BasicInfo` schema

```typescript
export interface BasicInfo {
  name: string;
  nameEn: string;
  phone: FieldCandidate[];           // changed from string
  phonePinnedId: string | null;      // new
  email: FieldCandidate[];           // changed from string
  emailPinnedId: string | null;      // new
  gender: string;
  birthday: string;
  age: number;
  nationality: string;
  ethnicity: string;
  politicalStatus: string;
  location: string;                  // stays single-value
  willingLocations: string[];
  avatar: string;
  socialLinks: Record<string, string>;
}
```

`createEmptyResume` produces `phone: []`, `email: []`, both `pinnedId` fields `null`.

### New storage key: `formpilot:profileDomainPrefs`

```typescript
type ProfileDomainPrefs = {
  [resumeId: string]: {
    [resumePath: string]: {   // 'basic.phone' | 'basic.email'
      [domain: string]: string;  // candidateId
    };
  };
};
```

**Why `resumeId`-scoped:** Profile is multi-resume (FormPilot already supports N resumes per user). A per-resume domain preference is the right default — switching resumes cleanly switches preferences. Phase A's `fieldDomainPrefs` is global because form entries are cross-resume by design.

**Why separate from Phase A's `fieldDomainPrefs`:** The two pipelines key on different things (Phase A = `signature`, Phase B = `resumePath`), are scoped differently (Phase A = global, Phase B = per-resume), and are invoked from different fill phases (Phase A = Phase 4, Phase B = Phase 2). Sharing a single store would require tagging entries to disambiguate; separate stores is simpler.

### Invariants

- `phone.length >= 0` (empty array is legal; equivalent to "no phone on this profile").
- `phonePinnedId` either `null` or the id of a candidate in `phone`. Same for `email`.
- Every `profileDomainPrefs[resumeId][path][domain]` id points to a candidate in that resume's array at that path.
- Candidates within a single `phone` or `email` array are unique by `value`. (Labels can differ across duplicates — not allowed; see §2 edit rules.)

### Cascade cleanup

Deleting a candidate:
1. If `pinnedId === deletedId` → set `pinnedId = null`.
2. For every domain in `profileDomainPrefs[resumeId][path]` whose value equals `deletedId` → delete that domain key.
3. If the resulting candidates array is empty → that's fine; `phone: []` is valid. Do not delete the `basic` sub-record.

Deleting a resume (existing feature) must clear that resume's entry in `profileDomainPrefs`.

## Candidate Lifecycle

### Creation paths

1. **Dashboard manual add.** User types `value` + `label` in `CandidateListField` → `addProfileCandidate(resumeId, path, value, label)` → new candidate with `hitCount: 0`, `createdAt = updatedAt = now`, `lastUrl: '(manual)'`.
2. **PDF/Word import.** `lib/import/*` emits one candidate per phone/email found. `label: ''`, `hitCount: 0`, `lastUrl: '(imported)'`. Multiple phones in one resume (rare): all written in order.
3. **Save-to-Profile (💾 menu).** Phase A `saveFormEntries` semantics: if any existing candidate's `value` matches the saved value → `hitCount++, updatedAt = now, lastUrl = sourceUrl`. Otherwise → append new candidate with `label: ''`, `hitCount: 1`, `lastUrl = sourceUrl`. Match key is `value` only (Profile has no `displayValue`).

### Use path

Phase 2 fill picks a candidate via `resolveCandidate` (§3), fills it, and causes `BUMP_PROFILE_HIT { resumePath, candidateId, sourceUrl }` — the selected candidate's `hitCount++, updatedAt = now, lastUrl = sourceUrl`.

### Edit rules

`updateProfileCandidate(resumeId, path, candidateId, value, label)`:
- If candidate does not exist → no-op.
- If new `value` equals another candidate's `value` (id different) → reject (no-op).
- Else update `value`, `label`, and `updatedAt`; id unchanged. Pin / domain-pref references survive.

### No GC

Profile candidates are user-managed. Silent deletion would damage trust. Removal is always explicit via Dashboard.

## Fill-Time Resolution

### Refactored `resolveCandidate` (shared helper)

Phase A's `resolveCandidate(entry, currentDomain, domainPrefs)` is refactored to take just the data it needs:

```typescript
export function resolveCandidate(
  candidates: FieldCandidate[],
  pinnedId: string | null,
  currentDomain: string,
  domainPrefs: Record<string, string>,
): FieldCandidate | null
```

Phase A callers update to `resolveCandidate(entry.candidates, entry.pinnedId, domain, prefs[sig] ?? {})`. Phase A's full test suite for `resolveCandidate` carries over unchanged (just argument reshape).

The 5-tier resolution order is identical to Phase A:
1. Domain preference (if the pref points to an existing candidate).
2. Global pin (if it points to an existing candidate).
3. Highest `hitCount`.
4. Tie-break: latest `updatedAt`.
5. Tie-break: earliest `createdAt` (stable).

### `getValueFromResume` in `orchestrator.ts`

Widened signature:

```typescript
export function getValueFromResume(
  resume: Resume,
  path: string,
  currentDomain: string,
  profileDomainPrefs: Record<string, Record<string, string>>,  // for this resume
): string
```

Dispatch on `path`:
- `'basic.phone'`:
  ```typescript
  const picked = resolveCandidate(
    resume.basic.phone,
    resume.basic.phonePinnedId,
    currentDomain,
    profileDomainPrefs['basic.phone'] ?? {},
  );
  return picked?.value ?? '';
  ```
- `'basic.email'`: symmetric.
- All other paths: existing dotted-path resolver unchanged.

### `orchestrateFill` signature

Gains a `profileDomainPrefs: Record<string, Record<string, string>>` parameter (this resume's slice) with default `{}`. Threaded from `content.ts` via `GET_FILL_CONTEXT`.

### `FillResult` gains `profileHits`

```typescript
export interface FillResult {
  items: FillResultItem[];
  filled: number;
  uncertain: number;
  unrecognized: number;
  formHits?: Array<{ signature: string; candidateId: string }>;  // Phase A
  profileHits?: Array<{ resumePath: string; candidateId: string }>;  // Phase B
}
```

Populated when `getValueFromResume` picked a candidate successfully. Content script iterates and fires `BUMP_PROFILE_HIT` per entry.

## Storage Layer API

### New file: `lib/storage/profile-candidates.ts`

Operates on the active resume (or a passed `resumeId` — caller decides). All functions load the resume via existing `resume-store`, mutate, save back.

```typescript
export type ProfileCandidatePath = 'basic.phone' | 'basic.email';

export async function upsertProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  value: string,
  sourceUrl: string,
): Promise<{ candidateId: string; bumped: boolean }>;

export async function addProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  value: string,
  label: string,
): Promise<string | null>;

export async function updateProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
  value: string,
  label: string,
): Promise<void>;

export async function deleteProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
): Promise<void>;   // cascade-cleans pin + domain prefs

export async function setProfilePin(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string | null,
): Promise<void>;

export async function bumpProfileCandidateHit(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
  sourceUrl: string,
): Promise<void>;
```

### New file: `lib/storage/profile-domain-prefs-store.ts`

Structurally identical to Phase A's `domain-prefs-store.ts`, but with the 3-level key shape and per-resume scoping.

```typescript
export async function listForResume(resumeId: string): Promise<Record<string, Record<string, string>>>;

export async function setProfileDomainPref(
  resumeId: string,
  path: ProfileCandidatePath,
  domain: string,
  candidateId: string,
): Promise<void>;

export async function clearProfileDomainPref(
  resumeId: string,
  path: ProfileCandidatePath,
  domain: string,
): Promise<void>;

export async function clearProfileDomainPrefsForPath(
  resumeId: string,
  path: ProfileCandidatePath,
): Promise<void>;

export async function clearProfileDomainPrefsForResume(
  resumeId: string,
): Promise<void>;  // called by deleteResume cascade

export async function clearPrefsPointingToProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
): Promise<void>;  // called by deleteProfileCandidate cascade
```

### New file: `lib/capture/candidate.ts`

Hosts the shared `FieldCandidate` type, `resolveCandidate` (refactored), and the `candidateMatches` helper. `lib/storage/form-store.ts` re-exports these for backward compatibility in its public API.

Moving these out of `form-store.ts` keeps that file focused on form-entry persistence and avoids Phase A / Phase B coupling at the storage layer.

### `deleteResume` cascade

Existing `resume-store.ts::deleteResume(id)` must also call `clearProfileDomainPrefsForResume(id)`.

## Dashboard UI

### New component: `components/popup/CandidateListField.tsx`

Replaces `<FormField>` for `basic.phone` and `basic.email` in `BasicInfo.tsx`. Props:

```typescript
interface CandidateListFieldProps {
  label: string;
  candidates: FieldCandidate[];
  pinnedId: string | null;
  domainPrefs: Record<string, string>;  // profileDomainPrefs[path]
  placeholder?: string;
  valueInputPlaceholder: string;
  labelInputPlaceholder: string;
  onAdd: (value: string, label: string) => void;
  onUpdate: (id: string, value: string, label: string) => void;
  onDelete: (id: string) => void;
  onSetPin: (id: string | null) => void;
  onClearDomainPref: (domain: string) => void;
}
```

### Layout

```
手机                          [+ 新增]
  ● 138xxxxxxxx   个人   ★ ✎ 🗑
  ○ 150xxxxxxxx   工作   ☆ ✎ 🗑
按域名覆盖
  workday.com → 150xxxxxxxx (工作)   🗑
```

- `●` / `○` — visual indicator of "this is the default candidate under a no-domain context" (computed via `pickDefault`, mirrors `SavedPages`'s helper). Not a click target.
- `★` / `☆` — pin toggle.
- `✎` — inline edit (expands row to two inputs: label, value; Save / Cancel).
- `🗑` — delete (cascade-cleans).
- `+ 新增` button expands a two-input mini-form (label + value) with Save / Cancel.
- Domain overrides section: collapsed-by-default sub-block listing `{ domain → value (label) }` with per-row 🗑.
- Empty-state when candidates is `[]`: a single "+ 新增" prompt, no list rows.

### BasicInfo.tsx changes

Replace the two `<FormField label={t('basic.phone')} ... />` and `<FormField label={t('basic.email')} ... />` blocks with `<CandidateListField ... />` calls, wiring the 5 callbacks to `chrome.runtime.sendMessage` with the new message types. All other BasicInfo fields unchanged.

### Not reused from Phase A

The Phase A `FormEntryPanel` (inside `SavedPages`) is not shared. It lives in a folding card and has entry-level metadata (hitCount sort, card-head pin star) that Profile's inline editor does not need. The shared layer is the data shape and `resolveCandidate`.

## In-Page ▾ Picker

Phase A's `CandidatePicker` and `mountCandidatePicker` are used unchanged. Only the picker-mount loop in `content.ts` is extended.

### Mount condition

After Phase A's existing `source === 'form'` loop, add a Phase 2 loop:

```typescript
for (const it of result.items) {
  if (!it.element) continue;
  if (it.source === 'form') { /* Phase A, unchanged */ continue; }
  if (it.resumePath !== 'basic.phone' && it.resumePath !== 'basic.email') continue;

  const candidates = it.resumePath === 'basic.phone' ? resume.basic.phone : resume.basic.email;
  const pinnedId   = it.resumePath === 'basic.phone' ? resume.basic.phonePinnedId : resume.basic.emailPinnedId;
  if (candidates.length < 2) continue;

  const currentCandidateId = profileHits.find((h) => h.resumePath === it.resumePath)?.candidateId ?? null;
  mountCandidatePicker({ target: it.element, signature: it.resumePath, candidates, pinnedId, currentCandidateId, t, onSelect, onPinToggle, onDelete, onManageAll });
}
```

### Callbacks

- **onSelect(candidateId):** re-fill with `candidate.value` via `fillElement`; fire `BUMP_PROFILE_HIT`; if first switch of `(path, currentDomain)` in this page session, show the Phase A domain-pref toast (`window.confirm`) → on Remember, fire `SET_PROFILE_DOMAIN_PREF { resumePath, domain, candidateId }`.
- **onPinToggle(candidateId):** `SET_PROFILE_PIN { resumePath, candidateId | null }`; update local `pinnedId` and call `picker.update(...)` for live re-render (Phase A pattern).
- **onDelete(candidateId):** `DELETE_PROFILE_CANDIDATE { resumePath, candidateId }`; local mutate + `picker.update(...)`; unmount if `candidates.length < 2` after delete.
- **onManageAll:** `window.open(chrome.runtime.getURL('/dashboard.html') + '#basic', '_blank')`.

### `promptedDomainPrefs` Set

Used by Phase A with keys like `${signature}:${domain}`. Phase B adds keys like `profile:${resumePath}:${domain}` (distinct prefix prevents collisions). Same in-page Set, same session lifetime.

## Background Message Routes

All new types; each returns `{ ok: true }` or `{ ok: true, data }`. All implicitly target the active resume — `resumeId` is resolved via `getActiveResumeId()` in the handler, not passed from the caller.

- `BUMP_PROFILE_HIT { resumePath, candidateId, sourceUrl }`
- `SET_PROFILE_PIN { resumePath, candidateId: string | null }`
- `ADD_PROFILE_CANDIDATE { resumePath, value, label }` → `{ id: string | null }`
- `UPDATE_PROFILE_CANDIDATE { resumePath, candidateId, value, label }`
- `DELETE_PROFILE_CANDIDATE { resumePath, candidateId }`
- `SET_PROFILE_DOMAIN_PREF { resumePath, domain, candidateId }`
- `CLEAR_PROFILE_DOMAIN_PREF { resumePath, domain }`
- `LIST_PROFILE_DOMAIN_PREFS` → `Record<string, Record<string, string>>` (for the active resume)

`GET_FILL_CONTEXT` response gains `profileDomainPrefs: Record<string, Record<string, string>>` — the active resume's slice of `formpilot:profileDomainPrefs`.

## Import / Export

### PDF/Word import (`lib/import/`)

Parsers produce `Partial<Resume>` with `basic.phone` / `basic.email` as candidate arrays:

```typescript
basic: {
  phone: phones.map((value) => ({
    id: crypto.randomUUID(), value, label: '', hitCount: 0,
    createdAt: now, updatedAt: now, lastUrl: '(imported)',
  })),
  phonePinnedId: null,
  email: emails.map(/* same shape */),
  emailPinnedId: null,
  // ...
}
```

Existing parser signatures that return strings are updated at the boundary, not in the innards.

### JSON import (`components/popup/ImportDialog.tsx` → `resume-store::importResume`)

Minimal defensive wrap for JSONs authored under the old single-value schema:

```typescript
if (typeof json.basic?.phone === 'string') {
  json.basic.phone = json.basic.phone
    ? [{ id: crypto.randomUUID(), value: json.basic.phone, label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '(imported)' }]
    : [];
  json.basic.phonePinnedId = null;
}
// same for email
```

Not a full migration layer — just the two fields that changed shape, so brand-new users importing a legacy JSON don't hit a type error.

### JSON export

Direct serialization of the new shape. `profileDomainPrefs` is **not** included — domain preferences are per-device and per-installation concerns, not part of a portable resume. Phase B.1 may revisit.

## i18n

New keys, both `zh.ts` and `en.ts`:

- `profile.candidate.add` — "+ 新增" / "+ Add"
- `profile.candidate.labelPlaceholder` — "标签（个人/工作）" / "Label (Personal / Work)"
- `profile.candidate.valuePlaceholder.phone` — "手机号" / "Phone number"
- `profile.candidate.valuePlaceholder.email` — "邮箱" / "Email address"
- `profile.candidate.noCandidates` — "未填写" / "Not set"
- `profile.candidate.save` — "保存" / "Save"
- `profile.candidate.cancel` — "取消" / "Cancel"

Reuse from Phase A: `candidate.picker.*`, `candidate.domainPref.*`, `candidate.dashboard.domainOverrides`, `candidate.dashboard.editValue`.

## Testing

### Unit (Vitest)

- `tests/lib/storage/profile-candidates.test.ts` — full API coverage: upsert (new / bump), add (reject duplicate, reject unknown path), update (id stability, reject duplicate), delete with pin cascade, delete with domain-pref cascade, setPin no-op on unknown id, bumpHit.
- `tests/lib/storage/profile-domain-prefs-store.test.ts` — CRUD + per-resume isolation (two resumes' prefs stay separate) + `clearPrefsPointingToProfileCandidate` with multi-match.
- `tests/lib/capture/resolve-candidate.test.ts` — port the 7 Phase A tests to the refactored `resolveCandidate(candidates, pinnedId, domain, prefs)` signature.
- `tests/lib/engine/orchestrator.test.ts` — add one Phase 2 + multi-candidate + domain-pref integration test; assert `profileHits` shape.
- `tests/lib/engine/getValueFromResume.test.ts` (existing, likely) — add tests for the new signature and `basic.phone` / `basic.email` dispatch.
- Phase A tests for `form-phase.ts` update to the new `resolveCandidate` signature; all existing cases pass unchanged.

### Manual QA

- Dashboard: add 2 phone candidates with labels, pin one, see ★ move; edit a value → id stable; delete pinned → pinnedId clears; delete all → empty state.
- Visit a site with a phone field: ▾ picker shows; switch → toast → Remember → revisit domain with same profile, new default.
- Switch active resume: the ▾ picker on a reloaded page shows the new resume's candidates.
- Delete a resume: its `profileDomainPrefs` entry is removed (no orphans in storage).
- Import a legacy JSON with `basic.phone: "138..."`: it becomes a single-candidate array.
- PDF import: parsed phone becomes one candidate; run Fill on a form; ▾ does NOT show (only 1 candidate).

## Non-Goals (Phase B does not do)

- Multi-value `location` — semantic collision with 籍贯/现居/工作地; needs new Profile paths first.
- Multi-value `socialLinks` — each key is already an independent path.
- Cross-resume candidate sharing — each resume's phone/email is independent by design.
- GC of Profile candidates — user-managed.
- `profileDomainPrefs` in JSON export — per-device concern, revisit in Phase B.1.
- Deep-linking `#basic` into a specific candidate — "Manage all candidates" opens the Basic tab, scroll-to-candidate is a minor follow-up.

## Open Questions

None. All scope locked during brainstorming.

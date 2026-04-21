# Form Entries Multi-Value Design (Phase A)

**Date:** 2026-04-21
**Scope:** Phase 4 cross-URL form entries only. Profile and Page Memory are unchanged.
**Deferred to Phase B:** Profile multi-value (e.g. personal vs. work phone/email) using the same picker component and resolution function built here.

## Problem

`lib/storage/form-store.ts` keys cross-URL remembered values by field signature, one value per signature, last-write-wins. Once the same signature is saved with a different value, the old value is gone. Users who answer the same question differently across sites (personal vs. work email, current city vs. home city, Chinese vs. pinyin name) cannot keep both — the second save destroys the first.

FormPilot's core premise is "every answer you've typed, remembered." Overwriting violates that.

## Goal

Cross-URL form entries become multi-value:

- All past distinct answers for a signature are preserved as candidates.
- A default candidate is chosen automatically for Phase 4 fill; users can override per domain or pin globally.
- Users discover and switch candidates via a ▾ picker attached to multi-value fields in the page.
- Users add / edit / delete / pin candidates in the Dashboard.

This is a brand-new extension — there is no existing user data to migrate. The existing `formpilot:formEntries` storage key is reused with the new schema.

## Data Model

### Reused storage key: `formpilot:formEntries`

```typescript
interface FieldCandidate {
  id: string;                 // uuid, created at candidate birth; never reused
  value: string;              // internal value (same semantics as CapturedField.value)
  displayValue?: string;      // user-visible option text for radio/select
  hitCount: number;           // increments on save-match and on fill-selection
  createdAt: number;
  updatedAt: number;
  lastUrl: string;            // per-candidate, so the picker can disambiguate look-alikes
}

interface FormEntry {
  signature: string;
  kind: CapturedFieldKind;
  label: string;              // last-seen human label, for display
  candidates: FieldCandidate[];
  pinnedId: string | null;    // user-selected global default; null = auto
}
```

Entry-level `lastUrl` and `updatedAt` are dropped; derive from the most recently updated candidate.

### New storage key: `formpilot:fieldDomainPrefs`

```typescript
type FieldDomainPrefs = {
  [signature: string]: {
    [domain: string]: string;   // candidate id
  };
};
```

**Domain key:** `hostname.replace(/^www\./, '')` — keeps subdomain fidelity. Exact match on read. Upgrading to eTLD+1 in the future is a read-path change, not a data-format change.

### Invariants

- `pinnedId` is either `null` or the id of a candidate in `candidates`.
- Every `fieldDomainPrefs[sig][domain]` id points to a candidate in `formEntries[sig].candidates`.
- `candidates.length >= 1` for every persisted `FormEntry` (no empty entries).
- Candidates within an entry are unique by `(value, displayValue ?? '')`.

### Cascade cleanup on candidate delete

Deleting a candidate triggers:

1. If `entry.pinnedId === deletedId` → set `pinnedId = null`.
2. For every domain in `fieldDomainPrefs[signature]` whose value equals `deletedId` → delete that domain key.
3. If the entry would be left with zero candidates → delete the entire `FormEntry` and `fieldDomainPrefs[signature]`.

## Candidate Lifecycle

### Save path (`saveFormEntries`, triggered by "Remember This Page")

For each `CapturedField` (already de-duped by signature and filtered for empty values):

1. **New signature** → create a `FormEntry` with one candidate (`hitCount: 1`, fresh timestamps, `pinnedId: null`).
2. **Known signature** (non-checkbox):
   - New `(value, displayValue)` matches an existing candidate → `hitCount++`, `updatedAt = now`, `lastUrl = sourceUrl`.
   - No match → append a new candidate (`hitCount: 1`, fresh timestamps).
3. **Known signature, `kind === 'checkbox'`** → replace the single candidate's `value` in place (`hitCount++` if the new value matches, else overwrite `value` + `hitCount = 1`; `updatedAt = now`). Checkbox entries always have exactly one candidate.
4. Refresh entry-level `label` on every save.

### Fill-selection path (Phase 4 fills a field, or user manually switches via ▾ picker)

Whichever candidate is used to fill: `hitCount++`, `updatedAt = now`. Auto-decided and user-picked selections are counted the same.

### GC

Runs after each `saveFormEntries` call, scoped to the signatures touched in that call (no full-store sweep).

A candidate is eligible for deletion when **all** of the following are true:

- `hitCount < 2`
- `now - updatedAt > 30 * 24 * 3600 * 1000` (30 days)
- `id !== entry.pinnedId`
- It is not the only remaining candidate in the entry

Thresholds live in `lib/capture/constants.ts`:

```typescript
export const WEAK_CANDIDATE_HIT_THRESHOLD = 2;
export const WEAK_CANDIDATE_AGE_MS = 30 * 24 * 3600 * 1000;
```

## Fill-Time Resolution

Phases 1-3 are unchanged. If Page Memory (Phase 3) hits for the current URL + signature, Phase 4 does not run and no candidate is consulted.

When Phase 4 runs for a signature, the candidate is chosen in this order:

1. `fieldDomainPrefs[signature][currentDomain]` points to an existing candidate → use it.
2. `entry.pinnedId` points to an existing candidate → use it.
3. Highest `hitCount`.
4. Tie-break by latest `updatedAt`.
5. Tie-break by earliest `createdAt` (stable, never random).

Implement as `resolveCandidate(entry, currentDomain, domainPrefs): FieldCandidate`. Unit-tested in isolation.

### Manual switch via ▾ picker → domain preference write

When the user opens the picker and selects a non-default candidate:

1. Fill the field with the selected candidate's value (run the full Phase 4 fill path — `displayValue` matching, widget-proxy sync, `hitCount++`).
2. If this is the **first time** during the current page session that the user switches a candidate for this signature on this domain:
   - Show a toast: `在 {domain} 下记住用「{displayValue ?? value}」？` / `Remember "{displayValue ?? value}" on {domain}?`
   - Options: **记住 / Remember**, **只此一次 / Once only**, **取消 / Cancel**
   - **Remember** → write `fieldDomainPrefs[sig][domain] = candidateId`
   - **Once only** → no write; suppress the toast for the rest of this page session
   - **Cancel** → revert the fill and leave the prior value in place

Subsequent switches on the same signature+domain during the same page session do not re-prompt.

## Picker UI

### ▾ badge visibility

- Rendered only when `entry.candidates.length >= 2`.
- Applies to `kind ∈ {text, textarea, date, select, radio}`.
- **Checkbox does not participate in multi-value.** `kind === 'checkbox'` entries keep last-write-wins semantics and are capped at one candidate; no ▾ is rendered.
- The badge shows regardless of which phase (Profile / Page Memory / Adapter / Phase 4) originally filled the field — it is a "FormPilot has alternates for you" affordance, not a "Phase 4 filled this" indicator.

### Positioning

- **text / textarea / date / select:** 12×12 px button, Shadow DOM mount, `position: absolute`, anchored to `getBoundingClientRect().right + 2` of the target element, vertically centered. Re-positioned on `scroll`, `resize`, and MutationObserver events.
- **radio:** anchored to the group heading (reuse the group-heading detection already used for label capture). Every option in the group shares one ▾.
- **Overflow:** if the ▾ would render outside the viewport or over another element, inset it to the right padding of the field. If that still fails, hide it — the user can manage from the Dashboard.

### Popover contents (click ▾ to open)

```
●  张三                   ★  🗑
   上次在 workday.com · 3 次命中
○  张三（拼音 Zhang San） ☆  🗑
   上次在 greenhouse.io · 1 次命中
────────────────────
管理全部候选 →
```

Per row:
- Click the row body → fill the field with this candidate's value (full Phase 4 fill flow; domain-pref toast fires as specified).
- `★ / ☆` → toggle `pinnedId` (global; at most one per entry).
- `🗑` → delete the candidate (cascade cleanup).

Footer link opens Dashboard → Saved Pages scrolled to the entry.

### Out of scope for Phase A

- The popover does **not** support adding a new candidate (use Dashboard or fill + Remember This Page).
- The popover does **not** support inline editing a candidate value (edit via Dashboard; semantically edit = delete + add for the picker).

### Shadow DOM isolation

Reuse the Shadow root mounting model from `components/toolbar/` and `components/capture/`. The ▾ and the popover are two layers; clicking outside the popover closes it.

## Dashboard (Saved Pages → Form Entries)

### Collapsed row

```
邮箱                                   2 candidates · ★
默认：zhang@company.com
```

- Left: `label`.
- Default line: the candidate that `resolveCandidate` would pick with no domain context (skip step 1 of the resolution order).
- Right: candidate count + ★ if `pinnedId` is set.

### Expanded panel

**① Candidate list**

Per candidate:
- Inline-editable `value` (and `displayValue` when `kind ∈ {radio, select}`).
- `hitCount`, `lastUrl`, relative time (reuse `lib/capture/time-format.ts`).
- `★ / ☆` pin toggle.
- `🗑` delete (cascade cleanup).

**② Add candidate**

A button expands an inline mini-form: `value` field; `displayValue` field when the entry's `kind ∈ {radio, select}`. On submit → generate uuid, `hitCount: 0`, fresh timestamps, `lastUrl: '(manual)'`.

A manually-added candidate starts at `hitCount: 0`, below the GC threshold, but `createdAt = now` keeps it young; it is safe from GC for at least 30 days. If the user never fills it in that window it becomes GC-eligible. To keep it permanently, pin it.

**③ Domain overrides**

Collapsible sub-block listing `fieldDomainPrefs[signature]`:

```
workday.com → zhang@company.com (候选 B)   🗑
lagou.com   → zhang_personal@gmail.com     🗑
```

Each row has a 🗑 button. **No "add domain override" form here** — domain prefs are only created via the picker toast flow, to keep authoring paths unified with the fill-time experience.

### Page-level behavior

- Existing search (by label, value) includes all candidate values.
- JSON import / export works on the new schema directly (brand-new extension — no legacy shape).
- No filter chips for "multi-candidate / has pin" in Phase A (YAGNI).

### ID stability

Inline-editing a candidate's `value` or `displayValue` does **not** change its `id`. Pin and domain-pref references survive edits. Only delete and add change the id set.

## Integration

### Background messages (`entrypoints/background.ts`)

Existing:
- `GET_FORM_ENTRIES` → returns `FormEntry[]` with the new schema.
- `DELETE_FORM_ENTRY` → unchanged; deletes the full entry.
- `CLEAR_FORM_ENTRIES` → unchanged.
- `SAVE_PAGE_MEMORY` fan-out to `form-store` → internal logic changes from last-write-wins to append-or-bump, message contract unchanged.

New:
- `DELETE_FORM_CANDIDATE { signature, candidateId }`
- `UPDATE_FORM_CANDIDATE { signature, candidateId, value, displayValue? }`
- `ADD_FORM_CANDIDATE { signature, value, displayValue?, kind? }`
- `SET_FORM_PIN { signature, candidateId: string | null }`
- `SET_DOMAIN_PREF { signature, domain, candidateId }`
- `CLEAR_DOMAIN_PREF { signature, domain }`

### Fill path (`lib/capture/form-phase.ts`)

- Replace direct `entry.value` read with `resolveCandidate(entry, currentDomain, domainPrefs)`.
- Write back `hitCount++` / `updatedAt` to the selected candidate (not the entry as a whole).
- `currentDomain` derived via `hostname.replace(/^www\./, '')` on the content-script side; passed through to background.

### New / changed files

| File | Change |
|------|--------|
| `lib/storage/form-store.ts` | Rewrite: new schema, append-or-bump save, GC, `resolveCandidate` |
| `lib/storage/domain-prefs-store.ts` | New: read / write / delete `fieldDomainPrefs` |
| `lib/capture/form-phase.ts` | Use `resolveCandidate`; write back to selected candidate |
| `lib/capture/constants.ts` | New thresholds (`WEAK_CANDIDATE_HIT_THRESHOLD`, `WEAK_CANDIDATE_AGE_MS`) |
| `components/capture/CandidatePicker/` | New: ▾ badge + popover (Shadow DOM) |
| `components/popup/sections/SavedPages/FormEntryItem.tsx` | Rewrite: expandable, candidate list, add form, domain prefs block |
| `lib/i18n/` | Add strings (see below) |
| `entrypoints/background.ts` | Route new message types |

### Phase B seam

`CandidatePicker` accepts `Candidate[]` (not `FormEntry`) and emits abstract callbacks (`onSelect`, `onPinToggle`, `onDelete`). Phase B can reuse it for Profile multi-value without refactor.

## i18n

New keys (add to both `zh` and `en`):

- `candidate.picker.manage` — "管理全部候选" / "Manage all candidates"
- `candidate.picker.pin` — "设为默认" / "Pin as default"
- `candidate.picker.unpin` — "取消默认" / "Unpin"
- `candidate.picker.delete` — "删除候选" / "Delete candidate"
- `candidate.picker.hitCountLabel` — "{n} 次命中" / "{n} hits"
- `candidate.picker.lastSeen` — "上次在 {domain}" / "Last seen on {domain}"
- `candidate.domainPref.rememberToast` — "在 {domain} 下记住用「{value}」？" / "Remember \"{value}\" on {domain}?"
- `candidate.domainPref.remember` — "记住" / "Remember"
- `candidate.domainPref.onceOnly` — "只此一次" / "Once only"
- `candidate.domainPref.cancel` — "取消" / "Cancel"
- `candidate.dashboard.addCandidate` — "新增候选" / "Add candidate"
- `candidate.dashboard.domainOverrides` — "按域名覆盖" / "Domain overrides"
- `candidate.dashboard.candidatesCount` — "{n} candidates"
- `candidate.dashboard.defaultLabel` — "默认：{value}" / "Default: {value}"

## Testing

### Unit (Vitest; extends the current 149-test suite)

- `form-store.test.ts`
  - Save: new-signature → create; known-signature + same `(value, displayValue)` → bump; known-signature + new pair → append.
  - GC: clears weak-and-old, spares pinned, spares the last remaining candidate, spares hits ≥ 2, spares recent.
  - Cascade cleanup on candidate delete: clears `pinnedId` when it matches; removes domain-pref entries pointing to the deleted id; removes the entry when the last candidate is deleted.
- `form-phase.test.ts` (or new `resolve-candidate.test.ts`)
  - Resolution order: domain pref > pin > hitCount > updatedAt > createdAt, with each step covered by a dedicated case.
  - Fallback when a stored pref / pinnedId points to a missing id (defensive; should not happen post-cascade but guarded anyway).
- `domain-prefs-store.test.ts`
  - Read / write / delete; signature-scoped isolation.
- `candidate-picker.test.tsx`
  - Render with 2+ candidates; pin toggle fires the right callback; delete fires the right callback; click row fires select callback with the right id.
  - DOM positioning is not unit-tested (covered manually with the Shadow DOM layer).
- `FormEntryItem.test.tsx`
  - Expand / collapse; inline edit preserves id; add-candidate submits with `hitCount: 0`; delete triggers cascade cleanup.

### Manual QA checklist (documented, not automated)

- Save the same signature with 3 different values across 3 sites → 3 candidates appear; default = highest `hitCount`.
- Open the ▾ picker, switch candidate, confirm toast, pick **Remember** → refresh the page; the domain-defaulted candidate is now used.
- Delete the pinned candidate → `pinnedId` clears; next fill falls back to `hitCount`.
- Save a rarely-used value (`hitCount: 1`) 31 days ago, then save any other signature → the weak candidate is GC'd (unless it was the only one or pinned).
- Save a checkbox signature twice with different values → entry stays at 1 candidate (last-write-wins preserved for checkbox).
- Edit a candidate's value in the Dashboard → its id is unchanged; any domain pref pointing to it still works.
- Delete an entry that has domain prefs → `fieldDomainPrefs[signature]` is fully cleared.

## Open Questions

None for Phase A. Deferred to Phase B:

- Profile multi-value: applying the same candidate + default + domain-override pattern to structured Profile fields (phone, email, address lines).
- Cross-entry bulk operations (e.g., "pin all my work emails at once") — likely unneeded.
- Per-subdomain vs eTLD+1 domain keying — revisit only if user feedback shows the current fidelity is too fine or too coarse.

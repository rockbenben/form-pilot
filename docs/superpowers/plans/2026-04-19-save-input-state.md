# Page Input State Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three-mode input state capture — draft snapshot + restore, write-back to resume, and per-page answer memory — to FormPilot's existing one-click auto-fill.

**Architecture:** New `lib/capture/` module for serialization / restoration / memory matching; new `lib/storage/{draft-store,page-memory-store}.ts` for persistence; refactor `orchestrator.ts` to extract a pure `scanFields()` function and add Phase 3 memory fallback; toolbar gains a `[💾]` button with a 3-option menu; content script mounts a top-right `DraftBadge` when a draft exists for the current URL.

**Tech Stack:** TypeScript, React 18, WXT (Manifest V3), chrome.storage.local, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-04-19-save-input-state-design.md`

---

## File Structure

**New library files (logic — tested):**
- `lib/capture/types.ts` — `CapturedField`, `CapturedFieldKind`
- `lib/capture/url-key.ts` — URL normalization (draft vs memory)
- `lib/capture/sensitive.ts` — sensitive-label detection + size constants
- `lib/capture/time-format.ts` — relative time formatter
- `lib/capture/serializer.ts` — DOM → `CapturedField[]`
- `lib/capture/restorer.ts` — `CapturedField[]` → DOM
- `lib/capture/element-value.ts` — read current value from any input element
- `lib/capture/writeback.ts` — merge page values into a `Resume`
- `lib/capture/memory-phase.ts` — Phase 3 fill from `PageMemoryEntry[]`
- `lib/storage/draft-store.ts` — draft CRUD + 30-day expiry
- `lib/storage/page-memory-store.ts` — page-memory CRUD + merge
- `lib/engine/scanner.ts` — extracted `scanFields()` (identification only)

**New React components (not separately tested):**
- `components/capture/ToolbarToast.tsx`
- `components/capture/SaveMenu.tsx`
- `components/capture/DraftBadge.tsx`
- `components/capture/mount-badge.tsx`
- `components/popup/sections/SavedPages.tsx`

**Modified files:**
- `lib/engine/orchestrator.ts` — use `scanFields`; add Phase 3
- `lib/storage/types.ts` — `Settings.skipSensitive`
- `lib/storage/settings-store.ts` — merge new default
- `lib/i18n/zh.ts` + `lib/i18n/en.ts` — ~30 new keys
- `entrypoints/background.ts` — 9 new message routes
- `entrypoints/content.ts` — mount badge; pass memory to orchestrator; new highlight colors; `data-formpilot-restored` skip logic
- `components/toolbar/FloatingToolbar.tsx` — `[💾]` button
- `components/toolbar/mount.tsx` — propagate save handlers
- `components/popup/Sidebar.tsx` — new `savedPages` nav item
- `components/popup/sections/Settings.tsx` — skipSensitive toggle
- `entrypoints/dashboard/App.tsx` — route `savedPages` section

**Test files:**
- `tests/lib/capture/serializer.test.ts`
- `tests/lib/capture/sensitive.test.ts`
- `tests/lib/capture/restorer.test.ts`
- `tests/lib/capture/writeback.test.ts`
- `tests/lib/capture/memory-phase.test.ts`
- `tests/lib/capture/url-key.test.ts`
- `tests/lib/capture/time-format.test.ts`
- `tests/lib/storage/draft-store.test.ts`
- `tests/lib/storage/page-memory-store.test.ts`
- `tests/lib/engine/scanner.test.ts`
- `tests/lib/engine/orchestrator.test.ts` — add Phase 3 case

---

## Task 1: Foundation types

**Files:**
- Create: `lib/capture/types.ts`

- [ ] **Step 1: Write the file**

```typescript
// lib/capture/types.ts
export type CapturedFieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox';

export interface CapturedField {
  /** Stable CSS selector: prefers `#id`, else tag[type]:nth-of-type(n) path. */
  selector: string;
  /**
   * Ordinal (0-based) of this field within the set of fields sharing the same
   * signature, in DOM order. Used as the fallback key when selector fails to
   * resolve, and as the primary key for page-memory matching across visits.
   */
  index: number;
  kind: CapturedFieldKind;
  /** select/radio: selected option value; checkbox: 'true' | 'false'; else: raw value */
  value: string;
  /** hash of (label | name | placeholder | aria-label) */
  signature: string;
  /** Human-readable label for display (not used for matching). */
  label: string;
}

export interface DraftSnapshot {
  url: string;
  savedAt: number; // Unix ms
  fields: CapturedField[];
}

export interface PageMemoryEntry {
  signature: string;
  index: number;
  kind: CapturedFieldKind;
  value: string;
  updatedAt: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/capture/types.ts
git commit -m "feat(capture): add CapturedField and snapshot types"
```

---

## Task 2: URL normalization

**Files:**
- Create: `lib/capture/url-key.ts`
- Test: `tests/lib/capture/url-key.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/capture/url-key.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeUrlForDraft, normalizeUrlForMemory } from '@/lib/capture/url-key';

describe('normalizeUrlForDraft', () => {
  it('strips hash, keeps query', () => {
    expect(normalizeUrlForDraft('https://a.com/apply?jobId=1#step2'))
      .toBe('https://a.com/apply?jobId=1');
  });

  it('treats different query strings as distinct URLs', () => {
    expect(normalizeUrlForDraft('https://a.com/apply?jobId=1'))
      .not.toBe(normalizeUrlForDraft('https://a.com/apply?jobId=2'));
  });

  it('returns input unchanged if already normalized', () => {
    expect(normalizeUrlForDraft('https://a.com/apply'))
      .toBe('https://a.com/apply');
  });

  it('falls back to raw string on malformed input', () => {
    expect(normalizeUrlForDraft('not a url')).toBe('not a url');
  });
});

describe('normalizeUrlForMemory', () => {
  it('strips hash AND query', () => {
    expect(normalizeUrlForMemory('https://a.com/apply?jobId=1#step2'))
      .toBe('https://a.com/apply');
  });

  it('treats different query strings as same memory key', () => {
    expect(normalizeUrlForMemory('https://a.com/apply?jobId=1'))
      .toBe(normalizeUrlForMemory('https://a.com/apply?jobId=2'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/capture/url-key.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/capture/url-key.ts

/** Draft key: strip hash; keep query (different jobs should not share drafts). */
export function normalizeUrlForDraft(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

/** Memory key: strip hash AND query (same-path pages share memorized answers). */
export function normalizeUrlForMemory(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return u.toString();
  } catch {
    return url;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/capture/url-key.test.ts`
Expected: PASS — all four cases per describe.

- [ ] **Step 5: Commit**

```bash
git add lib/capture/url-key.ts tests/lib/capture/url-key.test.ts
git commit -m "feat(capture): add URL normalization for draft + memory keys"
```

---

## Task 3: Sensitive-label detection + size constants

**Files:**
- Create: `lib/capture/sensitive.ts`
- Test: `tests/lib/capture/sensitive.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/capture/sensitive.test.ts
import { describe, it, expect } from 'vitest';
import { isSensitiveLabel, MAX_FIELD_SIZE, MAX_TOTAL_SIZE } from '@/lib/capture/sensitive';

describe('isSensitiveLabel', () => {
  it('matches Chinese sensitive terms', () => {
    expect(isSensitiveLabel('身份证号')).toBe(true);
    expect(isSensitiveLabel('验证码')).toBe(true);
    expect(isSensitiveLabel('银行卡号')).toBe(true);
    expect(isSensitiveLabel('密码')).toBe(true);
  });

  it('matches English sensitive terms', () => {
    expect(isSensitiveLabel('idCard')).toBe(true);
    expect(isSensitiveLabel('id-card')).toBe(true);
    expect(isSensitiveLabel('captcha')).toBe(true);
    expect(isSensitiveLabel('Verify Code')).toBe(true);
    expect(isSensitiveLabel('bankCard')).toBe(true);
    expect(isSensitiveLabel('Password')).toBe(true);
    expect(isSensitiveLabel('PIN')).toBe(true);
  });

  it('returns false for ordinary labels', () => {
    expect(isSensitiveLabel('email')).toBe(false);
    expect(isSensitiveLabel('姓名')).toBe(false);
    expect(isSensitiveLabel('school')).toBe(false);
  });

  it('returns false on empty or whitespace', () => {
    expect(isSensitiveLabel('')).toBe(false);
    expect(isSensitiveLabel('   ')).toBe(false);
  });
});

describe('size constants', () => {
  it('exposes documented limits', () => {
    expect(MAX_FIELD_SIZE).toBe(50 * 1024);
    expect(MAX_TOTAL_SIZE).toBe(500 * 1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/capture/sensitive.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/capture/sensitive.ts

export const SENSITIVE_PATTERNS: RegExp[] = [
  /id.?card/i,
  /身份证/,
  /bankcard/i,
  /bank.?card/i,
  /银行卡/,
  /captcha/i,
  /verify.?code/i,
  /验证码/,
  /password/i,
  /密码/,
  /\bpin\b/i,
];

export const MAX_FIELD_SIZE = 50 * 1024;    // single field value limit
export const MAX_TOTAL_SIZE = 500 * 1024;   // whole-page snapshot limit

/**
 * Returns true if the label/name/placeholder/aria-label text matches any
 * sensitive pattern. Empty/whitespace input returns false.
 */
export function isSensitiveLabel(text: string): boolean {
  if (!text || !text.trim()) return false;
  return SENSITIVE_PATTERNS.some((re) => re.test(text));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/capture/sensitive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/capture/sensitive.ts tests/lib/capture/sensitive.test.ts
git commit -m "feat(capture): add sensitive-label detection and size limits"
```

---

## Task 4: Relative time formatter

**Files:**
- Create: `lib/capture/time-format.ts`
- Test: `tests/lib/capture/time-format.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/capture/time-format.test.ts
import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '@/lib/capture/time-format';

describe('formatRelativeTime', () => {
  const now = new Date('2026-04-19T12:00:00Z').getTime();
  const t = (key: string, vars?: Record<string, string | number>) => {
    const map: Record<string, string> = {
      'time.justNow': 'just now',
      'time.minutesAgo': '{n} min ago',
      'time.hoursAgo': '{n} hr ago',
      'time.daysAgo': '{n} days ago',
    };
    let s = map[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  it('returns "just now" for < 60s', () => {
    expect(formatRelativeTime(now - 30_000, now, t)).toBe('just now');
  });

  it('returns minutes for < 60 min', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now, t)).toBe('5 min ago');
  });

  it('returns hours for < 24 h', () => {
    expect(formatRelativeTime(now - 3 * 3_600_000, now, t)).toBe('3 hr ago');
  });

  it('returns days for < 30 d', () => {
    expect(formatRelativeTime(now - 2 * 86_400_000, now, t)).toBe('2 days ago');
  });

  it('returns YYYY-MM-DD for >= 30 d', () => {
    expect(formatRelativeTime(now - 40 * 86_400_000, now, t)).toBe('2026-03-10');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/capture/time-format.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// lib/capture/time-format.ts

type T = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Format a past Unix-ms timestamp as a relative time string.
 *
 * @param past Timestamp in Unix milliseconds (older)
 * @param now  Current time in Unix milliseconds (for testability)
 * @param t    i18n lookup function with placeholder substitution
 */
export function formatRelativeTime(past: number, now: number, t: T): string {
  const diff = Math.max(0, now - past);
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const days = Math.floor(hr / 24);

  if (sec < 60) return t('time.justNow');
  if (min < 60) return t('time.minutesAgo', { n: min });
  if (hr < 24) return t('time.hoursAgo', { n: hr });
  if (days < 30) return t('time.daysAgo', { n: days });

  const d = new Date(past);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/capture/time-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/capture/time-format.ts tests/lib/capture/time-format.test.ts
git commit -m "feat(capture): add relative time formatter"
```

---

## Task 5: Draft store

**Files:**
- Create: `lib/storage/draft-store.ts`
- Test: `tests/lib/storage/draft-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/storage/draft-store.test.ts
import { describe, it, expect } from 'vitest';
import {
  saveDraft,
  getDraft,
  deleteDraft,
  listDrafts,
  DRAFT_TTL_MS,
} from '@/lib/storage/draft-store';
import type { CapturedField } from '@/lib/capture/types';

const fields: CapturedField[] = [
  { selector: '#a', index: 0, kind: 'text', value: '1', signature: 's1', label: 'A' },
];

describe('draft-store', () => {
  it('saves and retrieves a draft', async () => {
    await saveDraft('https://a.com/x', fields);
    const d = await getDraft('https://a.com/x');
    expect(d).not.toBeNull();
    expect(d!.fields).toEqual(fields);
    expect(d!.url).toBe('https://a.com/x');
    expect(typeof d!.savedAt).toBe('number');
  });

  it('returns null for missing URL', async () => {
    expect(await getDraft('https://missing.com/')).toBeNull();
  });

  it('overwrites existing draft for the same URL', async () => {
    await saveDraft('https://a.com/x', fields);
    const newFields: CapturedField[] = [
      { selector: '#b', index: 0, kind: 'text', value: '2', signature: 's2', label: 'B' },
    ];
    await saveDraft('https://a.com/x', newFields);
    const d = await getDraft('https://a.com/x');
    expect(d!.fields).toEqual(newFields);
  });

  it('treats drafts older than TTL as expired (getDraft returns null)', async () => {
    const url = 'https://a.com/x';
    await saveDraft(url, fields);
    // Age it by pushing savedAt back beyond TTL via internal manipulation:
    const store = await chrome.storage.local.get('formpilot:drafts');
    const raw = store['formpilot:drafts'] as Record<string, { savedAt: number }>;
    raw[url].savedAt = Date.now() - DRAFT_TTL_MS - 1;
    await chrome.storage.local.set({ 'formpilot:drafts': raw });

    expect(await getDraft(url)).toBeNull();
  });

  it('listDrafts filters out expired entries', async () => {
    await saveDraft('https://fresh.com/', fields);
    await saveDraft('https://old.com/', fields);
    const store = await chrome.storage.local.get('formpilot:drafts');
    const raw = store['formpilot:drafts'] as Record<string, { savedAt: number }>;
    raw['https://old.com/'].savedAt = Date.now() - DRAFT_TTL_MS - 1;
    await chrome.storage.local.set({ 'formpilot:drafts': raw });

    const list = await listDrafts();
    expect(list.map((d) => d.url)).toEqual(['https://fresh.com/']);
  });

  it('deletes a draft', async () => {
    await saveDraft('https://a.com/', fields);
    await deleteDraft('https://a.com/');
    expect(await getDraft('https://a.com/')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/storage/draft-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/storage/draft-store.ts
import type { CapturedField, DraftSnapshot } from '@/lib/capture/types';

const KEY = 'formpilot:drafts';

/** 30 days in milliseconds. */
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function readAll(): Promise<Record<string, DraftSnapshot>> {
  const res = await chrome.storage.local.get(KEY);
  return (res[KEY] as Record<string, DraftSnapshot> | undefined) ?? {};
}

async function writeAll(all: Record<string, DraftSnapshot>): Promise<void> {
  await chrome.storage.local.set({ [KEY]: all });
}

function isExpired(snap: DraftSnapshot, now = Date.now()): boolean {
  return now - snap.savedAt > DRAFT_TTL_MS;
}

/** Save (overwrite) the draft for the given URL. */
export async function saveDraft(url: string, fields: CapturedField[]): Promise<void> {
  const all = await readAll();
  all[url] = { url, savedAt: Date.now(), fields };
  await writeAll(all);
}

/** Return the non-expired draft for a URL, or null. */
export async function getDraft(url: string): Promise<DraftSnapshot | null> {
  const all = await readAll();
  const d = all[url];
  if (!d) return null;
  if (isExpired(d)) return null;
  return d;
}

/** Delete the draft for a URL (no-op if missing). */
export async function deleteDraft(url: string): Promise<void> {
  const all = await readAll();
  if (url in all) {
    delete all[url];
    await writeAll(all);
  }
}

/** List all non-expired drafts. */
export async function listDrafts(): Promise<DraftSnapshot[]> {
  const all = await readAll();
  return Object.values(all).filter((d) => !isExpired(d));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/storage/draft-store.test.ts`
Expected: PASS — 6/6.

- [ ] **Step 5: Commit**

```bash
git add lib/storage/draft-store.ts tests/lib/storage/draft-store.test.ts
git commit -m "feat(storage): add draft-store with 30-day TTL"
```

---

## Task 6: Page-memory store

**Files:**
- Create: `lib/storage/page-memory-store.ts`
- Test: `tests/lib/storage/page-memory-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/storage/page-memory-store.test.ts
import { describe, it, expect } from 'vitest';
import {
  savePageMemory,
  getPageMemory,
  deletePageMemory,
  listPageMemory,
} from '@/lib/storage/page-memory-store';
import type { CapturedField } from '@/lib/capture/types';

const mkField = (sig: string, idx: number, value: string): CapturedField => ({
  selector: `#${sig}-${idx}`,
  index: idx,
  kind: 'text',
  value,
  signature: sig,
  label: sig,
});

describe('page-memory-store', () => {
  it('appends entries on first save', async () => {
    await savePageMemory('https://a.com/apply', [
      mkField('why-you', 0, 'I love it'),
    ]);
    const entries = await getPageMemory('https://a.com/apply');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      signature: 'why-you',
      index: 0,
      kind: 'text',
      value: 'I love it',
    });
    expect(typeof entries[0].updatedAt).toBe('number');
  });

  it('overwrites entry with same (signature, index) and updates timestamp', async () => {
    const url = 'https://a.com/apply';
    await savePageMemory(url, [mkField('why-you', 0, 'v1')]);
    const [first] = await getPageMemory(url);

    // Wait a tick so the timestamp changes
    await new Promise((r) => setTimeout(r, 5));
    await savePageMemory(url, [mkField('why-you', 0, 'v2')]);
    const entries = await getPageMemory(url);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe('v2');
    expect(entries[0].updatedAt).toBeGreaterThan(first.updatedAt);
  });

  it('preserves previously-saved entries not present in the new save', async () => {
    const url = 'https://a.com/apply';
    await savePageMemory(url, [
      mkField('q1', 0, 'a1'),
      mkField('q2', 0, 'b1'),
    ]);
    // Only re-save q1
    await savePageMemory(url, [mkField('q1', 0, 'a2')]);
    const entries = await getPageMemory(url);
    const sigs = entries.map((e) => `${e.signature}:${e.value}`).sort();
    expect(sigs).toEqual(['q1:a2', 'q2:b1']);
  });

  it('treats (signature, index) pairs independently', async () => {
    const url = 'https://a.com/apply';
    await savePageMemory(url, [
      mkField('sig', 0, 'first'),
      mkField('sig', 1, 'second'),
    ]);
    const entries = await getPageMemory(url);
    expect(entries).toHaveLength(2);
    const byIndex = new Map(entries.map((e) => [e.index, e.value]));
    expect(byIndex.get(0)).toBe('first');
    expect(byIndex.get(1)).toBe('second');
  });

  it('returns [] for URL with no memory', async () => {
    expect(await getPageMemory('https://missing.com/')).toEqual([]);
  });

  it('deletes memory for a URL', async () => {
    await savePageMemory('https://a.com/', [mkField('s', 0, 'v')]);
    await deletePageMemory('https://a.com/');
    expect(await getPageMemory('https://a.com/')).toEqual([]);
  });

  it('lists all memory keyed by URL', async () => {
    await savePageMemory('https://a.com/', [mkField('s', 0, 'v')]);
    await savePageMemory('https://b.com/', [mkField('t', 0, 'w')]);
    const all = await listPageMemory();
    expect(Object.keys(all).sort()).toEqual(['https://a.com/', 'https://b.com/']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/storage/page-memory-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// lib/storage/page-memory-store.ts
import type { CapturedField, PageMemoryEntry } from '@/lib/capture/types';

const KEY = 'formpilot:pageMemory';

async function readAll(): Promise<Record<string, PageMemoryEntry[]>> {
  const res = await chrome.storage.local.get(KEY);
  return (res[KEY] as Record<string, PageMemoryEntry[]> | undefined) ?? {};
}

async function writeAll(all: Record<string, PageMemoryEntry[]>): Promise<void> {
  await chrome.storage.local.set({ [KEY]: all });
}

function toEntry(f: CapturedField, now: number): PageMemoryEntry {
  return {
    signature: f.signature,
    index: f.index,
    kind: f.kind,
    value: f.value,
    updatedAt: now,
  };
}

/** Merge-save: same (signature, index) overwrites; others preserved; new ones appended. */
export async function savePageMemory(
  url: string,
  fields: CapturedField[],
): Promise<number> {
  const all = await readAll();
  const existing = all[url] ?? [];
  const now = Date.now();

  const byKey = new Map<string, PageMemoryEntry>();
  for (const e of existing) byKey.set(`${e.signature}|${e.index}`, e);
  for (const f of fields) byKey.set(`${f.signature}|${f.index}`, toEntry(f, now));

  all[url] = Array.from(byKey.values());
  await writeAll(all);
  return fields.length;
}

export async function getPageMemory(url: string): Promise<PageMemoryEntry[]> {
  const all = await readAll();
  return all[url] ?? [];
}

export async function deletePageMemory(url: string): Promise<void> {
  const all = await readAll();
  if (url in all) {
    delete all[url];
    await writeAll(all);
  }
}

export async function listPageMemory(): Promise<Record<string, PageMemoryEntry[]>> {
  return readAll();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/storage/page-memory-store.test.ts`
Expected: PASS — 7/7.

- [ ] **Step 5: Commit**

```bash
git add lib/storage/page-memory-store.ts tests/lib/storage/page-memory-store.test.ts
git commit -m "feat(storage): add page-memory-store with (signature,index) merge"
```

---

## Task 7: DOM → CapturedField serializer

**Files:**
- Create: `lib/capture/serializer.ts`
- Test: `tests/lib/capture/serializer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/capture/serializer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { serializeFields } from '@/lib/capture/serializer';
import { MAX_FIELD_SIZE, MAX_TOTAL_SIZE } from '@/lib/capture/sensitive';

beforeEach(() => { document.body.innerHTML = ''; });

describe('serializeFields', () => {
  it('serializes text input with label', () => {
    document.body.innerHTML = `
      <label for="n">Name</label>
      <input id="n" name="name" type="text" value="张三">
    `;
    const { fields, skipped } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      kind: 'text',
      value: '张三',
      label: 'Name',
    });
    expect(fields[0].selector).toBe('#n');
    expect(skipped).toBe(0);
  });

  it('serializes textarea, select, and checkbox', () => {
    document.body.innerHTML = `
      <textarea id="bio">hi</textarea>
      <select id="color"><option value="red" selected>Red</option><option value="blue">Blue</option></select>
      <input id="agree" type="checkbox" checked>
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    const byKind = Object.fromEntries(fields.map((f) => [f.kind, f]));
    expect(byKind.textarea.value).toBe('hi');
    expect(byKind.select.value).toBe('red');
    expect(byKind.checkbox.value).toBe('true');
  });

  it('keeps only the selected radio within a group', () => {
    document.body.innerHTML = `
      <input type="radio" name="g" value="a">
      <input type="radio" name="g" value="b" checked>
      <input type="radio" name="g" value="c">
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(1);
    expect(fields[0].kind).toBe('radio');
    expect(fields[0].value).toBe('b');
  });

  it('assigns increasing index to fields sharing a signature', () => {
    document.body.innerHTML = `
      <label>Email</label><input name="email1" type="email" value="a@a">
      <label>Email</label><input name="email2" type="email" value="b@b">
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(2);
    const emails = fields.filter((f) => f.label === 'Email');
    expect(emails).toHaveLength(2);
    expect(emails.map((f) => f.index).sort()).toEqual([0, 1]);
    expect(emails[0].signature).toBe(emails[1].signature);
  });

  it('skips password, hidden, file, submit, reset, button inputs', () => {
    document.body.innerHTML = `
      <input type="password" value="secret">
      <input type="hidden" value="x">
      <input type="file">
      <input type="submit" value="Go">
      <input type="reset" value="Reset">
      <input type="button" value="Btn">
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toEqual([]);
  });

  it('skips readOnly and disabled', () => {
    document.body.innerHTML = `
      <input name="a" readonly value="x">
      <input name="b" disabled value="y">
    `;
    const { fields } = serializeFields(document, { skipSensitive: true });
    expect(fields).toEqual([]);
  });

  it('skips sensitive labels when skipSensitive=true', () => {
    document.body.innerHTML = `
      <label for="id">身份证号</label>
      <input id="id" name="idCard" value="123">
    `;
    const { fields, skipped } = serializeFields(document, { skipSensitive: true });
    expect(fields).toEqual([]);
    expect(skipped).toBeGreaterThanOrEqual(1);
  });

  it('does not skip sensitive labels when skipSensitive=false', () => {
    document.body.innerHTML = `
      <label for="id">身份证号</label>
      <input id="id" name="idCard" value="123">
    `;
    const { fields } = serializeFields(document, { skipSensitive: false });
    expect(fields).toHaveLength(1);
    expect(fields[0].value).toBe('123');
  });

  it('skips individual fields larger than MAX_FIELD_SIZE', () => {
    const big = 'x'.repeat(MAX_FIELD_SIZE + 1);
    const small = 'ok';
    document.body.innerHTML = `
      <textarea id="big">${big}</textarea>
      <input id="small" value="${small}">
    `;
    const { fields, skipped } = serializeFields(document, { skipSensitive: true });
    expect(fields).toHaveLength(1);
    expect(fields[0].value).toBe(small);
    expect(skipped).toBeGreaterThanOrEqual(1);
  });

  it('truncates total payload above MAX_TOTAL_SIZE by dropping largest fields first', () => {
    // Create 12 textareas each with 49 KB of content (below field limit but total > 500KB)
    const chunk = 'y'.repeat(49 * 1024);
    let html = '';
    for (let i = 0; i < 12; i++) html += `<textarea id="t${i}">${chunk}</textarea>`;
    document.body.innerHTML = html;
    const { fields } = serializeFields(document, { skipSensitive: true });
    const total = fields.reduce((sum, f) => sum + f.value.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_SIZE);
    expect(fields.length).toBeLessThan(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/capture/serializer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// lib/capture/serializer.ts
import type { CapturedField, CapturedFieldKind } from './types';
import { isSensitiveLabel, MAX_FIELD_SIZE, MAX_TOTAL_SIZE } from './sensitive';

export interface SerializeOptions {
  skipSensitive: boolean;
}

export interface SerializeResult {
  fields: CapturedField[];
  /** Count of inputs skipped due to sensitive/size filters. */
  skipped: number;
}

const SKIPPED_INPUT_TYPES = new Set([
  'hidden', 'submit', 'reset', 'button', 'image', 'password', 'file',
]);

/** Stable djb2-style hash over a small string. Returns a hex string. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function findLabelText(el: Element): string {
  const id = el.getAttribute('id');
  if (id) {
    const labelEl = el.ownerDocument?.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (labelEl) return labelEl.textContent?.trim() ?? '';
  }
  let p = el.parentElement;
  while (p) {
    if (p.tagName.toLowerCase() === 'label') {
      const clone = p.cloneNode(true) as Element;
      clone.querySelectorAll('input, select, textarea').forEach((c) => c.remove());
      const text = clone.textContent?.trim();
      if (text) return text;
    }
    p = p.parentElement;
  }
  return '';
}

function computeSignature(el: Element, labelText: string): string {
  const name = el.getAttribute('name') ?? '';
  const placeholder = el.getAttribute('placeholder') ?? '';
  const aria = el.getAttribute('aria-label') ?? '';
  return hashString(`${labelText}|${name}|${placeholder}|${aria}`);
}

function buildSelector(el: Element): string {
  const id = el.getAttribute('id');
  if (id) return `#${CSS.escape(id)}`;
  const tag = el.tagName.toLowerCase();
  const type = el.getAttribute('type');
  const base = type ? `${tag}[type="${type}"]` : tag;
  // nth-of-type within same-tag-same-type siblings is approximated by DOM order:
  const all = Array.from(
    el.ownerDocument!.querySelectorAll(
      type ? `${tag}[type="${CSS.escape(type)}"]` : tag,
    ),
  );
  const n = all.indexOf(el) + 1;
  return `${base}:nth-of-type(${n})`;
}

function detectKind(el: Element): CapturedFieldKind | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    return 'text';
  }
  return null;
}

function readElementValue(el: Element, kind: CapturedFieldKind): string {
  if (kind === 'checkbox') return (el as HTMLInputElement).checked ? 'true' : 'false';
  if (kind === 'select') return (el as HTMLSelectElement).value ?? '';
  return (el as HTMLInputElement | HTMLTextAreaElement).value ?? '';
}

export function serializeFields(
  doc: Document,
  opts: SerializeOptions,
): SerializeResult {
  const inputs = Array.from(doc.querySelectorAll('input, textarea, select'));
  let skipped = 0;

  // Pre-filter radios: keep only the checked one per (name) group.
  const radiosByName = new Map<string, HTMLInputElement>();
  const skippedRadios = new Set<Element>();
  for (const el of inputs) {
    if (
      el.tagName.toLowerCase() === 'input'
      && (el.getAttribute('type') ?? '').toLowerCase() === 'radio'
    ) {
      const name = el.getAttribute('name') ?? '';
      if (!name) continue;
      const existing = radiosByName.get(name);
      const r = el as HTMLInputElement;
      if (r.checked) radiosByName.set(name, r);
      else if (!existing) skippedRadios.add(r);
    }
  }
  // Any radio in a group that has a checked sibling chosen becomes skipped.
  for (const el of inputs) {
    if (
      el.tagName.toLowerCase() === 'input'
      && (el.getAttribute('type') ?? '').toLowerCase() === 'radio'
    ) {
      const name = el.getAttribute('name') ?? '';
      if (!name) continue;
      const keep = radiosByName.get(name);
      if (keep && keep !== el) skippedRadios.add(el);
      if (!keep) skippedRadios.add(el); // no checked in group → skip all
    }
  }

  const preliminary: CapturedField[] = [];
  const signatureIndex = new Map<string, number>();

  for (const el of inputs) {
    // Tag-level filter:
    if (el.tagName.toLowerCase() === 'input') {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (SKIPPED_INPUT_TYPES.has(type)) { continue; }
    }

    const kind = detectKind(el);
    if (!kind) continue;

    // Readonly/disabled:
    const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if ((inputEl as HTMLInputElement).readOnly) continue;
    if (inputEl.disabled) continue;

    // Radio group reduction:
    if (kind === 'radio' && skippedRadios.has(el)) continue;

    const labelText = findLabelText(el);
    const name = el.getAttribute('name') ?? '';
    const placeholder = el.getAttribute('placeholder') ?? '';
    const aria = el.getAttribute('aria-label') ?? '';

    if (opts.skipSensitive) {
      const blob = `${labelText} ${name} ${placeholder} ${aria}`;
      if (isSensitiveLabel(blob)) { skipped++; continue; }
    }

    const value = readElementValue(el, kind);
    if (value.length > MAX_FIELD_SIZE) { skipped++; continue; }

    const signature = computeSignature(el, labelText);
    const idx = signatureIndex.get(signature) ?? 0;
    signatureIndex.set(signature, idx + 1);

    preliminary.push({
      selector: buildSelector(el),
      index: idx,
      kind,
      value,
      signature,
      label: labelText || aria || placeholder || name,
    });
  }

  // Enforce total-size budget by dropping largest fields first.
  let totalSize = preliminary.reduce((sum, f) => sum + f.value.length, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    const indices = preliminary
      .map((f, i) => ({ i, len: f.value.length }))
      .sort((a, b) => b.len - a.len);
    const dropped = new Set<number>();
    for (const { i, len } of indices) {
      if (totalSize <= MAX_TOTAL_SIZE) break;
      dropped.add(i);
      totalSize -= len;
      skipped++;
    }
    return {
      fields: preliminary.filter((_, i) => !dropped.has(i)),
      skipped,
    };
  }

  return { fields: preliminary, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/capture/serializer.test.ts`
Expected: PASS — 10/10.

- [ ] **Step 5: Commit**

```bash
git add lib/capture/serializer.ts tests/lib/capture/serializer.test.ts
git commit -m "feat(capture): add DOM serializer with filtering and size limits"
```

---

## Task 8: Element value reader (shared util)

**Files:**
- Create: `lib/capture/element-value.ts`

- [ ] **Step 1: Write the file**

```typescript
// lib/capture/element-value.ts
import type { CapturedFieldKind } from './types';

/**
 * Detect the CapturedFieldKind of an input-like element, or null if not
 * a serializable input (e.g. button, hidden, file, password).
 */
export function detectElementKind(el: Element): CapturedFieldKind | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    if (['hidden', 'submit', 'reset', 'button', 'image', 'password', 'file'].includes(type)) {
      return null;
    }
    return 'text';
  }
  return null;
}

/** Read the current value of an input/textarea/select/checkbox/radio as a string. */
export function readElementValue(el: Element): string {
  const kind = detectElementKind(el);
  if (!kind) return '';
  if (kind === 'checkbox') return (el as HTMLInputElement).checked ? 'true' : 'false';
  if (kind === 'radio') {
    const r = el as HTMLInputElement;
    return r.checked ? r.value : '';
  }
  return (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value ?? '';
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/capture/element-value.ts
git commit -m "feat(capture): add shared element-value reader"
```

---

## Task 9: CapturedField → DOM restorer

**Files:**
- Create: `lib/capture/restorer.ts`
- Test: `tests/lib/capture/restorer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/capture/restorer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { restoreFields } from '@/lib/capture/restorer';
import type { CapturedField } from '@/lib/capture/types';

beforeEach(() => { document.body.innerHTML = ''; });

describe('restoreFields', () => {
  it('restores text input value and dispatches input/change events', () => {
    document.body.innerHTML = `<input id="n" type="text">`;
    const el = document.getElementById('n') as HTMLInputElement;
    let inputFired = 0, changeFired = 0;
    el.addEventListener('input', () => inputFired++);
    el.addEventListener('change', () => changeFired++);

    const fields: CapturedField[] = [
      { selector: '#n', index: 0, kind: 'text', value: '张三', signature: 's', label: 'n' },
    ];
    const res = restoreFields(document, fields);
    expect(res.restored).toBe(1);
    expect(res.missing).toBe(0);
    expect(el.value).toBe('张三');
    expect(inputFired).toBeGreaterThanOrEqual(1);
    expect(changeFired).toBeGreaterThanOrEqual(1);
    expect(el.getAttribute('data-formpilot-restored')).toBe('draft');
  });

  it('restores textarea and select', () => {
    document.body.innerHTML = `
      <textarea id="t"></textarea>
      <select id="s"><option value="a">A</option><option value="b">B</option></select>
    `;
    restoreFields(document, [
      { selector: '#t', index: 0, kind: 'textarea', value: 'hi', signature: '1', label: 't' },
      { selector: '#s', index: 0, kind: 'select', value: 'b', signature: '2', label: 's' },
    ]);
    expect((document.getElementById('t') as HTMLTextAreaElement).value).toBe('hi');
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('b');
  });

  it('selects the correct radio by value', () => {
    document.body.innerHTML = `
      <input type="radio" id="r1" name="g" value="a">
      <input type="radio" id="r2" name="g" value="b">
    `;
    restoreFields(document, [
      { selector: '#r2', index: 0, kind: 'radio', value: 'b', signature: 's', label: 'g' },
    ]);
    expect((document.getElementById('r2') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('r1') as HTMLInputElement).checked).toBe(false);
  });

  it('restores checkbox boolean state', () => {
    document.body.innerHTML = `
      <input id="a" type="checkbox">
      <input id="b" type="checkbox" checked>
    `;
    restoreFields(document, [
      { selector: '#a', index: 0, kind: 'checkbox', value: 'true', signature: '1', label: 'a' },
      { selector: '#b', index: 0, kind: 'checkbox', value: 'false', signature: '2', label: 'b' },
    ]);
    expect((document.getElementById('a') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('b') as HTMLInputElement).checked).toBe(false);
  });

  it('counts missing fields when selector does not match and no signature fallback available', () => {
    document.body.innerHTML = `<input id="other">`;
    const res = restoreFields(document, [
      { selector: '#gone', index: 0, kind: 'text', value: 'x', signature: 'never-matches', label: 'x' },
    ]);
    expect(res.restored).toBe(0);
    expect(res.missing).toBe(1);
  });

  it('falls back to (signature, index) when selector does not match', () => {
    // selector #old doesn't exist, but signature does; there are two same-signature fields.
    document.body.innerHTML = `
      <label>Email</label><input data-sig="email-sig" value="">
      <label>Email</label><input data-sig="email-sig" value="">
    `;
    // We simulate "signature match" by a helper: the restorer must accept a
    // signature-matcher option. (See restorer.ts for sigMatcher semantics.)
    const { restoreFields: restore } = require('@/lib/capture/restorer');
    const res = restore(
      document,
      [
        { selector: '#old-that-is-gone', index: 1, kind: 'text', value: 'hit', signature: 'email-sig', label: 'Email' },
      ],
      {
        sigMatcher: (el: Element) => el.getAttribute('data-sig') ?? '',
      },
    );
    expect(res.restored).toBe(1);
    const inputs = document.querySelectorAll('input');
    expect((inputs[0] as HTMLInputElement).value).toBe('');
    expect((inputs[1] as HTMLInputElement).value).toBe('hit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/capture/restorer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// lib/capture/restorer.ts
import type { CapturedField } from './types';

export interface RestoreOptions {
  /**
   * Function returning a field's signature from a DOM element.
   * Used only for fallback matching when `selector` fails.
   * Default: re-computes signature via the same algorithm as serializer.
   */
  sigMatcher?: (el: Element) => string;
  /** Tag written to restored elements to prevent auto-fill overwrite. */
  marker?: string;
}

export interface RestoreResult {
  restored: number;
  missing: number;
}

function defaultSig(el: Element): string {
  // Lazy-required to avoid circular import with serializer; re-compute
  // inline to keep the restorer self-contained.
  const labelText = findLabelText(el);
  const name = el.getAttribute('name') ?? '';
  const placeholder = el.getAttribute('placeholder') ?? '';
  const aria = el.getAttribute('aria-label') ?? '';
  return hashString(`${labelText}|${name}|${placeholder}|${aria}`);
}

function findLabelText(el: Element): string {
  const id = el.getAttribute('id');
  if (id) {
    const labelEl = el.ownerDocument?.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (labelEl) return labelEl.textContent?.trim() ?? '';
  }
  let p = el.parentElement;
  while (p) {
    if (p.tagName.toLowerCase() === 'label') {
      const clone = p.cloneNode(true) as Element;
      clone.querySelectorAll('input, select, textarea').forEach((c) => c.remove());
      const text = clone.textContent?.trim();
      if (text) return text;
    }
    p = p.parentElement;
  }
  return '';
}

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function nativeSet(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el.tagName.toLowerCase() === 'textarea'
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set) desc.set.call(el, value); else el.value = value;
}

function dispatch(el: Element, events: string[]): void {
  for (const name of events) {
    el.dispatchEvent(new Event(name, { bubbles: true, cancelable: true }));
  }
}

function resolveTarget(
  doc: Document,
  field: CapturedField,
  sigMatcher: (el: Element) => string,
): Element | null {
  // Try selector-unique first.
  try {
    const matched = doc.querySelectorAll(field.selector);
    if (matched.length === 1) return matched[0];
  } catch { /* invalid selector → fall through */ }
  // Signature fallback (only if field.signature provided).
  if (!field.signature) return null;
  const all = Array.from(doc.querySelectorAll('input, textarea, select'));
  const sameSig = all.filter((el) => sigMatcher(el) === field.signature);
  return sameSig[field.index] ?? null;
}

export function restoreFields(
  doc: Document,
  fields: CapturedField[],
  opts: RestoreOptions = {},
): RestoreResult {
  const sigMatcher = opts.sigMatcher ?? defaultSig;
  const marker = opts.marker ?? 'draft';
  let restored = 0, missing = 0;

  for (const f of fields) {
    const el = resolveTarget(doc, f, sigMatcher);
    if (!el) { missing++; continue; }

    switch (f.kind) {
      case 'text':
      case 'textarea':
        nativeSet(el as HTMLInputElement | HTMLTextAreaElement, f.value);
        dispatch(el, ['focus', 'input', 'change', 'blur']);
        break;
      case 'select': {
        (el as HTMLSelectElement).value = f.value;
        dispatch(el, ['focus', 'change', 'blur']);
        break;
      }
      case 'radio': {
        const r = el as HTMLInputElement;
        r.checked = r.value === f.value;
        dispatch(r, ['focus', 'change', 'blur']);
        break;
      }
      case 'checkbox': {
        const c = el as HTMLInputElement;
        c.checked = f.value === 'true';
        dispatch(c, ['focus', 'change', 'blur']);
        break;
      }
    }

    (el as HTMLElement).setAttribute('data-formpilot-restored', marker);
    restored++;
  }

  return { restored, missing };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/capture/restorer.test.ts`
Expected: PASS — 6/6.

- [ ] **Step 5: Commit**

```bash
git add lib/capture/restorer.ts tests/lib/capture/restorer.test.ts
git commit -m "feat(capture): add DOM restorer with signature fallback"
```

---

## Task 10: Extract scanFields from orchestrator

**Files:**
- Create: `lib/engine/scanner.ts`
- Modify: `lib/engine/orchestrator.ts`
- Test: `tests/lib/engine/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/engine/scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { scanFields } from '@/lib/engine/scanner';

beforeEach(() => { document.body.innerHTML = ''; });

describe('scanFields', () => {
  it('returns one item per input/select/textarea', async () => {
    document.body.innerHTML = `
      <label for="n">姓名</label><input id="n" name="name" type="text">
      <label for="e">邮箱</label><input id="e" name="email" type="email">
      <label for="u">你的问题</label><input id="u" name="unknown" type="text">
    `;
    const items = await scanFields(document, null);
    expect(items).toHaveLength(3);
    const recognized = items.filter((i) => i.status === 'recognized');
    expect(recognized.map((i) => i.resumePath).sort()).toEqual(
      ['basic.email', 'basic.name'].sort(),
    );
    expect(items.filter((i) => i.status === 'unrecognized')).toHaveLength(1);
  });

  it('does NOT mutate element values', async () => {
    document.body.innerHTML = `<input id="n" name="name" value="pre">`;
    await scanFields(document, null);
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('pre');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/engine/scanner.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `scanner.ts`**

```typescript
// lib/engine/scanner.ts
import type { PlatformAdapter, FillSource, InputType } from './adapters/types';
import { matchField } from './heuristic/engine';

export type ScannedStatus = 'recognized' | 'unrecognized';

export interface ScannedItem {
  element: Element;
  resumePath: string;
  label: string;
  inputType: InputType;
  confidence: number;
  source: FillSource;
  status: ScannedStatus;
}

/**
 * Identify fields on a page. Does NOT fill or mutate DOM values.
 * Runs adapter + heuristic cascade, identical to orchestrateFill's Phase 1+2,
 * but returns recognized/unrecognized items without applying values.
 */
export async function scanFields(
  doc: Document,
  adapter: PlatformAdapter | null,
): Promise<ScannedItem[]> {
  const items: ScannedItem[] = [];
  const handled = new Set<Element>();

  if (adapter) {
    const mappings = adapter.scan(doc);
    for (const m of mappings) {
      handled.add(m.element);
      items.push({
        element: m.element,
        resumePath: m.resumePath,
        label: m.label,
        inputType: m.inputType,
        confidence: m.confidence,
        source: 'adapter',
        status: m.resumePath ? 'recognized' : 'unrecognized',
      });
    }
  }

  const inputs = doc.querySelectorAll('input, select, textarea');
  for (const el of inputs) {
    if (handled.has(el)) continue;
    if (el.tagName.toLowerCase() === 'input') {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (['hidden', 'submit', 'reset', 'button', 'image'].includes(type)) continue;
    }
    const m = matchField(el);
    if (!m || m.confidence < 0.5) {
      const label =
        el.getAttribute('aria-label') ??
        el.getAttribute('placeholder') ??
        el.getAttribute('name') ??
        el.getAttribute('id') ??
        '';
      items.push({
        element: el,
        resumePath: '',
        label,
        inputType: m?.inputType ?? 'text',
        confidence: m?.confidence ?? 0,
        source: 'heuristic',
        status: 'unrecognized',
      });
      continue;
    }
    items.push({
      element: el,
      resumePath: m.resumePath,
      label: m.label,
      inputType: m.inputType,
      confidence: m.confidence,
      source: 'heuristic',
      status: 'recognized',
    });
  }
  return items;
}
```

- [ ] **Step 4: Refactor `orchestrator.ts` to reuse `scanFields`**

Replace the entire Phase 1 + Phase 2 loops in `orchestrateFill` with a single call to `scanFields`. The orchestrator then iterates the scanned items to execute fills. Full rewrite:

```typescript
// lib/engine/orchestrator.ts
import type { PlatformAdapter, FillResult, FillResultItem } from './adapters/types';
import type { Resume } from '@/lib/storage/types';
import { scanFields } from './scanner';
import { fillElement } from './heuristic/fillers';

// ─── Resume Path Resolver ─────────────────────────────────────────────────────
// (unchanged — keep existing getValueFromResume implementation)
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
  if (Array.isArray(cursor)) return cursor.join(', ');
  return String(cursor);
}

/**
 * Fill a document's form fields using the cascade strategy:
 *   Phase 1 (adapter) + Phase 2 (heuristic) — via scanFields
 *   Phase 3 (page memory) — added in a later task
 */
export async function orchestrateFill(
  doc: Document,
  resume: Resume,
  adapter: PlatformAdapter | null,
): Promise<FillResult> {
  const scanned = await scanFields(doc, adapter);
  const items: FillResultItem[] = [];

  for (const s of scanned) {
    // Skip elements already marked as restored from a draft (user-owned content).
    if ((s.element as HTMLElement).getAttribute?.('data-formpilot-restored') === 'draft') {
      continue;
    }

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
      } catch {
        filled = false;
      }
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

  const filled = items.filter((i) => i.status === 'filled').length;
  const uncertain = items.filter((i) => i.status === 'uncertain').length;
  const unrecognized = items.filter((i) => i.status === 'unrecognized').length;
  return { items, filled, uncertain, unrecognized };
}
```

- [ ] **Step 5: Run all tests**

Run: `pnpm run test`
Expected: existing orchestrator tests still PASS; new scanner tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/scanner.ts lib/engine/orchestrator.ts tests/lib/engine/scanner.test.ts
git commit -m "refactor(engine): extract scanFields; preserve existing cascade behavior"
```

---

## Task 11: Write-back to resume

**Files:**
- Create: `lib/capture/writeback.ts`
- Test: `tests/lib/capture/writeback.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/capture/writeback.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { collectWriteBack, applyWriteback } from '@/lib/capture/writeback';
import { createEmptyResume } from '@/lib/storage/types';
import type { ScannedItem } from '@/lib/engine/scanner';

beforeEach(() => { document.body.innerHTML = ''; });

function item(
  partial: Partial<ScannedItem> & { element: Element; resumePath: string },
): ScannedItem {
  return {
    label: partial.resumePath,
    inputType: 'text',
    confidence: 0.9,
    source: 'heuristic',
    status: 'recognized',
    ...partial,
  } as ScannedItem;
}

describe('collectWriteBack', () => {
  it('aggregates page values by resumePath, last non-empty wins', () => {
    document.body.innerHTML = `
      <input id="e1" value="a@x.com">
      <input id="e2" value="b@y.com">
    `;
    const e1 = document.getElementById('e1')!;
    const e2 = document.getElementById('e2')!;
    const items = [
      item({ element: e1, resumePath: 'basic.email' }),
      item({ element: e2, resumePath: 'basic.email' }),
    ];
    const pairs = collectWriteBack(items);
    expect(pairs).toEqual([{ resumePath: 'basic.email', value: 'b@y.com' }]);
  });

  it('ignores unrecognized and empty-valued items', () => {
    document.body.innerHTML = `<input id="x" value="hi"><input id="y" value="">`;
    const x = document.getElementById('x')!;
    const y = document.getElementById('y')!;
    const items = [
      item({ element: x, resumePath: '', status: 'unrecognized' }),
      item({ element: y, resumePath: 'basic.name' }),
    ];
    expect(collectWriteBack(items)).toEqual([]);
  });

  it('handles checkboxes and selects', () => {
    document.body.innerHTML = `
      <input id="c" type="checkbox" checked>
      <select id="s"><option value="red" selected>Red</option></select>
    `;
    const c = document.getElementById('c')!;
    const s = document.getElementById('s')!;
    const pairs = collectWriteBack([
      item({ element: c, resumePath: 'custom.agree' }),
      item({ element: s, resumePath: 'basic.gender' }),
    ]);
    const byPath = Object.fromEntries(pairs.map((p) => [p.resumePath, p.value]));
    expect(byPath['custom.agree']).toBe('true');
    expect(byPath['basic.gender']).toBe('red');
  });
});

describe('applyWriteback', () => {
  it('writes scalar basic fields', () => {
    const resume = createEmptyResume('id', 'name');
    const updated = applyWriteback(resume, [
      { resumePath: 'basic.email', value: 'a@a' },
      { resumePath: 'basic.name', value: '李四' },
    ]);
    expect(updated.basic.email).toBe('a@a');
    expect(updated.basic.name).toBe('李四');
  });

  it('writes indexed array fields, growing the array', () => {
    const resume = createEmptyResume('id', 'name');
    const updated = applyWriteback(resume, [
      { resumePath: 'education[1].school', value: '清华' },
    ]);
    expect(updated.education).toHaveLength(2);
    expect(updated.education[1].school).toBe('清华');
  });

  it('writes unindexed array path to index 0', () => {
    const resume = createEmptyResume('id', 'name');
    const updated = applyWriteback(resume, [
      { resumePath: 'education.school', value: '北大' },
    ]);
    expect(updated.education).toHaveLength(1);
    expect(updated.education[0].school).toBe('北大');
  });

  it('splits comma-separated values for string-array fields', () => {
    const resume = createEmptyResume('id', 'name');
    const updated = applyWriteback(resume, [
      { resumePath: 'skills.languages', value: 'JS, TS, Go' },
    ]);
    expect(updated.skills.languages).toEqual(['JS', 'TS', 'Go']);
  });

  it('returns the count of applied writes', () => {
    const resume = createEmptyResume('id', 'name');
    const { updated: _u, applied } = applyWritebackWithCount(resume, [
      { resumePath: 'basic.email', value: 'x' },
      { resumePath: 'basic.name', value: 'y' },
    ]);
    expect(applied).toBe(2);
  });
});

import { applyWritebackWithCount } from '@/lib/capture/writeback';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/capture/writeback.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// lib/capture/writeback.ts
import type { Resume } from '@/lib/storage/types';
import type { ScannedItem } from '@/lib/engine/scanner';
import { readElementValue } from './element-value';

export interface WriteBackPair {
  resumePath: string;
  value: string;
}

/**
 * From scanned items, read current DOM values and aggregate by resumePath.
 * Same resumePath appearing multiple times: last non-empty value wins.
 * Unrecognized items and empty values are ignored.
 */
export function collectWriteBack(items: ScannedItem[]): WriteBackPair[] {
  const map = new Map<string, string>();
  for (const it of items) {
    if (it.status !== 'recognized') continue;
    if (!it.resumePath) continue;
    const v = readElementValue(it.element);
    if (!v) continue;
    map.set(it.resumePath, v);
  }
  return Array.from(map.entries()).map(([resumePath, value]) => ({ resumePath, value }));
}

/** Paths whose values are stored as string[] in Resume — comma-split when writing. */
const ARRAY_SCALAR_PATHS = new Set([
  'basic.willingLocations',
  'skills.languages',
  'skills.frameworks',
  'skills.tools',
  'skills.certificates',
  'jobPreference.positions',
  'jobPreference.industries',
]);

function setDeep(obj: unknown, parts: string[], value: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === null || cur[parts[i]] === undefined) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function setValueInResume(resume: Resume, path: string, raw: string): void {
  const value = ARRAY_SCALAR_PATHS.has(path)
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : raw;

  const indexed = path.match(/^(\w+)\[(\d+)\]\.(.+)$/);
  if (indexed) {
    const [, section, idxStr, field] = indexed;
    const arr = (resume as unknown as Record<string, unknown[]>)[section];
    if (!Array.isArray(arr)) return;
    const idx = parseInt(idxStr, 10);
    while (arr.length <= idx) arr.push({ ...(arr[0] ?? {}) });
    setDeep(arr[idx], field.split('.'), value);
    return;
  }

  const parts = path.split('.');
  if (parts.length >= 2) {
    const section = parts[0];
    const rest = parts.slice(1);
    const arr = (resume as unknown as Record<string, unknown[]>)[section];
    if (Array.isArray(arr)) {
      if (arr.length === 0) arr.push({});
      setDeep(arr[0], rest, value);
      return;
    }
  }
  setDeep(resume, parts, value);
}

/**
 * Return a new Resume with the pairs applied.
 */
export function applyWriteback(resume: Resume, pairs: WriteBackPair[]): Resume {
  const clone: Resume = JSON.parse(JSON.stringify(resume));
  for (const { resumePath, value } of pairs) {
    setValueInResume(clone, resumePath, value);
  }
  return clone;
}

/** Convenience returning both the updated resume and the count applied. */
export function applyWritebackWithCount(
  resume: Resume,
  pairs: WriteBackPair[],
): { updated: Resume; applied: number } {
  const updated = applyWriteback(resume, pairs);
  return { updated, applied: pairs.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/capture/writeback.test.ts`
Expected: PASS — 8/8.

- [ ] **Step 5: Commit**

```bash
git add lib/capture/writeback.ts tests/lib/capture/writeback.test.ts
git commit -m "feat(capture): add write-back aggregator and resume merger"
```

---

## Task 12: Phase-3 memory filler

**Files:**
- Create: `lib/capture/memory-phase.ts`
- Test: `tests/lib/capture/memory-phase.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/capture/memory-phase.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { runMemoryPhase } from '@/lib/capture/memory-phase';
import type { PageMemoryEntry } from '@/lib/capture/types';
import type { ScannedItem } from '@/lib/engine/scanner';

beforeEach(() => { document.body.innerHTML = ''; });

function item(el: Element, status: 'recognized' | 'unrecognized' = 'unrecognized'): ScannedItem {
  return {
    element: el,
    resumePath: status === 'recognized' ? 'basic.name' : '',
    label: 'x',
    inputType: 'text',
    confidence: 0,
    source: 'heuristic',
    status,
  };
}

describe('runMemoryPhase', () => {
  it('fills unrecognized input matching signature', async () => {
    document.body.innerHTML = `
      <label>Why us?</label><input id="q" name="whyUs" type="text">
    `;
    const el = document.getElementById('q')!;
    const { computeSignatureFor } = await import('@/lib/capture/signature');
    const sig = computeSignatureFor(el);
    const entries: PageMemoryEntry[] = [
      { signature: sig, index: 0, kind: 'text', value: 'I love it', updatedAt: Date.now() },
    ];
    const items: ScannedItem[] = [item(el, 'unrecognized')];
    const filled = await runMemoryPhase(document, items, entries);
    expect(filled).toBe(1);
    expect((el as HTMLInputElement).value).toBe('I love it');
  });

  it('does not touch recognized items', async () => {
    document.body.innerHTML = `<input id="q" value="pre">`;
    const el = document.getElementById('q')!;
    const { computeSignatureFor } = await import('@/lib/capture/signature');
    const sig = computeSignatureFor(el);
    const entries: PageMemoryEntry[] = [
      { signature: sig, index: 0, kind: 'text', value: 'override', updatedAt: Date.now() },
    ];
    const items: ScannedItem[] = [item(el, 'recognized')];
    const filled = await runMemoryPhase(document, items, entries);
    expect(filled).toBe(0);
    expect((el as HTMLInputElement).value).toBe('pre');
  });

  it('matches by (signature, index) for duplicate-signature fields', async () => {
    document.body.innerHTML = `
      <label>Ref</label><input id="r1" name="ref" type="text">
      <label>Ref</label><input id="r2" name="ref" type="text">
    `;
    const r1 = document.getElementById('r1')!;
    const r2 = document.getElementById('r2')!;
    const { computeSignatureFor } = await import('@/lib/capture/signature');
    const sig = computeSignatureFor(r1);
    const entries: PageMemoryEntry[] = [
      { signature: sig, index: 0, kind: 'text', value: 'first', updatedAt: 0 },
      { signature: sig, index: 1, kind: 'text', value: 'second', updatedAt: 0 },
    ];
    const items: ScannedItem[] = [item(r1, 'unrecognized'), item(r2, 'unrecognized')];
    await runMemoryPhase(document, items, entries);
    expect((r1 as HTMLInputElement).value).toBe('first');
    expect((r2 as HTMLInputElement).value).toBe('second');
  });

  it('marks filled items with source=memory', async () => {
    document.body.innerHTML = `<label>Q</label><input id="q" name="q">`;
    const el = document.getElementById('q')!;
    const { computeSignatureFor } = await import('@/lib/capture/signature');
    const entries: PageMemoryEntry[] = [
      { signature: computeSignatureFor(el), index: 0, kind: 'text', value: 'a', updatedAt: 0 },
    ];
    const items: ScannedItem[] = [item(el, 'unrecognized')];
    await runMemoryPhase(document, items, entries);
    expect(items[0].source).toBe('memory' as unknown as ScannedItem['source']);
  });
});
```

- [ ] **Step 2: Extract `computeSignatureFor` to a shared module**

Create `lib/capture/signature.ts` so serializer, restorer, and memory-phase share one implementation:

```typescript
// lib/capture/signature.ts

export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export function findLabelText(el: Element): string {
  const id = el.getAttribute('id');
  if (id) {
    const labelEl = el.ownerDocument?.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (labelEl) return labelEl.textContent?.trim() ?? '';
  }
  let p = el.parentElement;
  while (p) {
    if (p.tagName.toLowerCase() === 'label') {
      const clone = p.cloneNode(true) as Element;
      clone.querySelectorAll('input, select, textarea').forEach((c) => c.remove());
      const text = clone.textContent?.trim();
      if (text) return text;
    }
    p = p.parentElement;
  }
  return '';
}

export function computeSignatureFor(el: Element): string {
  const labelText = findLabelText(el);
  const name = el.getAttribute('name') ?? '';
  const placeholder = el.getAttribute('placeholder') ?? '';
  const aria = el.getAttribute('aria-label') ?? '';
  return hashString(`${labelText}|${name}|${placeholder}|${aria}`);
}
```

Then update `serializer.ts` and `restorer.ts` to import from `./signature` instead of their local copies. Remove the duplicate `findLabelText`, `computeSignature`/`defaultSig`, and `hashString` from both files.

- [ ] **Step 3: Extend the FillSource union**

Modify `lib/engine/adapters/types.ts` and add `'memory'`:

```typescript
export type FillSource = 'adapter' | 'heuristic' | 'ai' | 'memory';
```

- [ ] **Step 4: Implement `memory-phase.ts`**

```typescript
// lib/capture/memory-phase.ts
import type { PageMemoryEntry } from './types';
import type { ScannedItem } from '@/lib/engine/scanner';
import { computeSignatureFor } from './signature';
import { detectElementKind } from './element-value';
import { fillElement } from '@/lib/engine/heuristic/fillers';

/**
 * Walk the scanned items and, for each unrecognized one, try to match it
 * against the given memory entries by (signature, per-signature-index in DOM
 * order). On match, fill the element and mutate the ScannedItem to
 * status='recognized', source='memory', resumePath='(memory)'.
 *
 * Returns the count of elements filled from memory.
 */
export async function runMemoryPhase(
  doc: Document,
  items: ScannedItem[],
  entries: PageMemoryEntry[],
): Promise<number> {
  if (entries.length === 0) return 0;

  // Build index: signature → list of unrecognized items (in DOM order).
  const unrecognizedBySignature = new Map<string, ScannedItem[]>();
  for (const it of items) {
    if (it.status !== 'unrecognized') continue;
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
    const kind = detectElementKind(target.element) ?? entry.kind;
    const inputType = kind === 'textarea' ? 'textarea'
      : kind === 'select' ? 'select'
      : kind === 'radio' ? 'radio'
      : kind === 'checkbox' ? 'checkbox'
      : 'text';
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
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run tests/lib/capture/memory-phase.test.ts`
Expected: PASS — 4/4.

Run: `pnpm run test` — full suite should still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/capture/signature.ts lib/capture/memory-phase.ts lib/capture/serializer.ts lib/capture/restorer.ts lib/engine/adapters/types.ts tests/lib/capture/memory-phase.test.ts
git commit -m "feat(capture): add Phase 3 memory filler; consolidate signature util"
```

---

## Task 13: Orchestrator Phase-3 integration

**Files:**
- Modify: `lib/engine/orchestrator.ts`
- Modify: `tests/lib/engine/orchestrator.test.ts`

- [ ] **Step 1: Add failing integration test**

Append to `tests/lib/engine/orchestrator.test.ts`:

```typescript
import { computeSignatureFor } from '@/lib/capture/signature';
import type { PageMemoryEntry } from '@/lib/capture/types';

describe('orchestrateFill with page memory', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('fills unrecognized fields from page memory as Phase 3', async () => {
    const resume: Resume = createEmptyResume('t', 't');
    document.body.innerHTML = `
      <label for="q">你最大的缺点</label>
      <input id="q" name="weakness" type="text">
    `;
    const q = document.getElementById('q')!;
    const entries: PageMemoryEntry[] = [
      { signature: computeSignatureFor(q), index: 0, kind: 'text', value: 'I overthink', updatedAt: 0 },
    ];
    const result = await orchestrateFill(document, resume, null, entries);
    expect((q as HTMLInputElement).value).toBe('I overthink');
    expect(result.items[0].source).toBe('memory');
    expect(result.items[0].status).toBe('filled');
  });

  it('does not overwrite already-filled fields with memory', async () => {
    const resume: Resume = {
      ...createEmptyResume('t', 't'),
      basic: { ...createEmptyResume('', '').basic, name: '张三' },
    };
    document.body.innerHTML = `<label for="n">姓名</label><input id="n" name="name">`;
    const el = document.getElementById('n')!;
    const entries: PageMemoryEntry[] = [
      { signature: computeSignatureFor(el), index: 0, kind: 'text', value: '李四', updatedAt: 0 },
    ];
    const result = await orchestrateFill(document, resume, null, entries);
    expect((el as HTMLInputElement).value).toBe('张三');
    expect(result.items[0].source).toBe('heuristic');
  });
});
```

- [ ] **Step 2: Run to see failures**

Run: `pnpm exec vitest run tests/lib/engine/orchestrator.test.ts`
Expected: FAIL — `orchestrateFill` does not accept a memory parameter.

- [ ] **Step 3: Integrate memory phase into `orchestrator.ts`**

```typescript
// lib/engine/orchestrator.ts — extend orchestrateFill
import { runMemoryPhase } from '@/lib/capture/memory-phase';
import type { PageMemoryEntry } from '@/lib/capture/types';

export async function orchestrateFill(
  doc: Document,
  resume: Resume,
  adapter: PlatformAdapter | null,
  memoryEntries: PageMemoryEntry[] = [],
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
      // Reconcile: find items now flagged source='memory' in scanned and upgrade them.
      for (const s of scanned) {
        if (s.source !== 'memory') continue;
        const it = items.find((i) => i.element === s.element);
        if (!it) continue;
        it.status = 'filled';
        it.source = 'memory';
        it.resumePath = '(memory)';
      }
    }
  }

  const filled = items.filter((i) => i.status === 'filled').length;
  const uncertain = items.filter((i) => i.status === 'uncertain').length;
  const unrecognized = items.filter((i) => i.status === 'unrecognized').length;
  return { items, filled, uncertain, unrecognized };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm run test`
Expected: all tests PASS including the two new orchestrator cases.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/orchestrator.ts tests/lib/engine/orchestrator.test.ts
git commit -m "feat(engine): integrate Phase 3 page-memory fallback into orchestrateFill"
```

---

## Task 14: Extend Settings with skipSensitive

**Files:**
- Modify: `lib/storage/types.ts`
- Modify: `lib/storage/settings-store.ts` (default merge already handles new fields)

- [ ] **Step 1: Add field to Settings + default**

Edit `lib/storage/types.ts`:

```typescript
// BEFORE
export interface Settings {
  toolbarPosition: { x: number; y: number };
  apiKey: string;
  apiProvider: 'deepseek' | 'openai' | '';
}

export const DEFAULT_SETTINGS: Settings = {
  toolbarPosition: { x: 16, y: 80 },
  apiKey: '',
  apiProvider: '',
};

// AFTER
export interface Settings {
  toolbarPosition: { x: number; y: number };
  apiKey: string;
  apiProvider: 'deepseek' | 'openai' | '';
  skipSensitive: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  toolbarPosition: { x: 16, y: 80 },
  apiKey: '',
  apiProvider: '',
  skipSensitive: true,
};
```

- [ ] **Step 2: Run full suite**

Run: `pnpm run test`
Expected: PASS — `getSettings()` already spreads `DEFAULT_SETTINGS` for missing keys.

- [ ] **Step 3: Commit**

```bash
git add lib/storage/types.ts
git commit -m "feat(storage): add skipSensitive setting, default true"
```

---

## Task 15: Background message routes

**Files:**
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Replace the handleMessage switch**

```typescript
// entrypoints/background.ts
export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true;
  });
});

async function handleMessage(message: { type: string; [key: string]: unknown }) {
  const { getResume, getActiveResumeId, updateResume } = await import('@/lib/storage/resume-store');
  const { getSettings, updateSettings } = await import('@/lib/storage/settings-store');
  const draftStore = await import('@/lib/storage/draft-store');
  const memStore = await import('@/lib/storage/page-memory-store');
  const { applyWriteback } = await import('@/lib/capture/writeback');

  switch (message.type) {
    case 'GET_ACTIVE_RESUME': {
      const id = await getActiveResumeId();
      if (!id) return { ok: true, data: null };
      return { ok: true, data: await getResume(id) };
    }
    case 'GET_SETTINGS':
      return { ok: true, data: await getSettings() };
    case 'SAVE_TOOLBAR_POSITION': {
      const position = message.position as { x: number; y: number };
      await updateSettings({ toolbarPosition: position });
      return { ok: true, data: null };
    }

    // ── Drafts ───────────────────────────────────────────────────────────
    case 'SAVE_DRAFT': {
      const { url, fields } = message as { url: string; fields: unknown };
      try {
        await draftStore.saveDraft(url, fields as never);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
    case 'GET_DRAFT': {
      const { url } = message as { url: string };
      return { ok: true, data: await draftStore.getDraft(url) };
    }
    case 'DELETE_DRAFT': {
      const { url } = message as { url: string };
      await draftStore.deleteDraft(url);
      return { ok: true };
    }
    case 'LIST_DRAFTS':
      return { ok: true, data: await draftStore.listDrafts() };

    // ── Page Memory ──────────────────────────────────────────────────────
    case 'SAVE_PAGE_MEMORY': {
      const { url, fields } = message as { url: string; fields: unknown };
      try {
        const saved = await memStore.savePageMemory(url, fields as never);
        return { ok: true, data: { saved } };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
    case 'GET_PAGE_MEMORY': {
      const { url } = message as { url: string };
      return { ok: true, data: await memStore.getPageMemory(url) };
    }
    case 'DELETE_PAGE_MEMORY': {
      const { url } = message as { url: string };
      await memStore.deletePageMemory(url);
      return { ok: true };
    }
    case 'LIST_PAGE_MEMORY':
      return { ok: true, data: await memStore.listPageMemory() };

    // ── Write-back to resume ─────────────────────────────────────────────
    case 'WRITE_BACK_TO_RESUME': {
      const { pairs } = message as { pairs: { resumePath: string; value: string }[] };
      const id = await getActiveResumeId();
      if (!id) return { ok: false, error: 'no active resume' };
      const resume = await getResume(id);
      if (!resume) return { ok: false, error: 'active resume not found' };
      const updated = applyWriteback(resume, pairs);
      const { meta: _m, ...patch } = updated;
      await updateResume(id, patch);
      return { ok: true, data: { updated: pairs.length, name: resume.meta.name } };
    }

    default:
      return { ok: false, error: `Unknown message type: ${message.type}` };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat(background): route draft, memory, and writeback messages"
```

---

## Task 16: i18n strings

**Files:**
- Modify: `lib/i18n/zh.ts`
- Modify: `lib/i18n/en.ts`

- [ ] **Step 1: Add keys to `zh.ts`**

Append these entries to the object literal in `lib/i18n/zh.ts`:

```typescript
  // ── Capture feature ─────────────────────────────────────────────
  'toolbar.save': '保存',

  'capture.menu.draft': '📝 保存草稿',
  'capture.menu.writeback': '↩️ 写回简历',
  'capture.menu.memory': '🧠 记住本页作答',

  'capture.toast.draft.saved': '已保存 {n} 个字段的草稿',
  'capture.toast.draft.partial': '已保存 {n} 个，跳过 {m} 个',
  'capture.toast.writeback.done': '已写回 {n} 个字段到「{name}」',
  'capture.toast.memory.saved': '已记住 {n} 个字段的作答',
  'capture.toast.nothingToWriteBack': '当前页没有可写回的字段',
  'capture.toast.noActiveResume': '请先选择一份活动简历',
  'capture.toast.storageFull': '存储空间不足，请在 Dashboard 清理',

  'capture.badge.detected': '检测到 {n} 个字段的草稿（{time}）',
  'capture.badge.restore': '恢复',
  'capture.badge.restoreAndFill': '恢复并继续填充',
  'capture.badge.ignore': '忽略',
  'capture.badge.delete': '删除',
  'capture.badge.restored': '已恢复 {filled}/{total} 个字段',

  'time.justNow': '刚刚',
  'time.minutesAgo': '{n} 分钟前',
  'time.hoursAgo': '{n} 小时前',
  'time.daysAgo': '{n} 天前',

  'nav.savedPages': '已保存页面',
  'savedPages.drafts.title': '草稿',
  'savedPages.drafts.empty': '暂无草稿',
  'savedPages.memory.title': '页面记忆',
  'savedPages.memory.empty': '暂无页面记忆',
  'savedPages.column.url': '网址',
  'savedPages.column.savedAt': '保存时间',
  'savedPages.column.fields': '字段数',
  'savedPages.column.actions': '操作',
  'savedPages.action.view': '查看',
  'savedPages.action.delete': '删除',

  'settings.capture.title': '保存/恢复',
  'settings.capture.skipSensitive': '跳过敏感字段（身份证、验证码等）',
```

- [ ] **Step 2: Add the mirrored English entries to `en.ts`**

```typescript
  // ── Capture feature ─────────────────────────────────────────────
  'toolbar.save': 'Save',

  'capture.menu.draft': '📝 Save Draft',
  'capture.menu.writeback': '↩️ Write Back to Resume',
  'capture.menu.memory': '🧠 Remember This Page',

  'capture.toast.draft.saved': 'Saved draft with {n} fields',
  'capture.toast.draft.partial': '{n} saved, {m} skipped',
  'capture.toast.writeback.done': 'Wrote back {n} fields to "{name}"',
  'capture.toast.memory.saved': 'Remembered {n} fields',
  'capture.toast.nothingToWriteBack': 'No fields to write back',
  'capture.toast.noActiveResume': 'Please select an active resume',
  'capture.toast.storageFull': 'Storage full. Please clean up in Dashboard',

  'capture.badge.detected': 'Draft with {n} fields detected ({time})',
  'capture.badge.restore': 'Restore',
  'capture.badge.restoreAndFill': 'Restore + Auto Fill',
  'capture.badge.ignore': 'Ignore',
  'capture.badge.delete': 'Delete',
  'capture.badge.restored': 'Restored {filled}/{total}',

  'time.justNow': 'just now',
  'time.minutesAgo': '{n} min ago',
  'time.hoursAgo': '{n} hr ago',
  'time.daysAgo': '{n} days ago',

  'nav.savedPages': 'Saved Pages',
  'savedPages.drafts.title': 'Drafts',
  'savedPages.drafts.empty': 'No drafts',
  'savedPages.memory.title': 'Page Memory',
  'savedPages.memory.empty': 'No saved memory',
  'savedPages.column.url': 'URL',
  'savedPages.column.savedAt': 'Saved At',
  'savedPages.column.fields': 'Fields',
  'savedPages.column.actions': 'Actions',
  'savedPages.action.view': 'View',
  'savedPages.action.delete': 'Delete',

  'settings.capture.title': 'Capture',
  'settings.capture.skipSensitive': 'Skip sensitive fields (ID, captcha, etc.)',
```

- [ ] **Step 3: Extend `t()` to support variables**

Check `lib/i18n/index.ts`. The current `t` does not accept a vars object. Patch `makeT` and the hook's `t` so placeholders `{n}`, `{name}`, `{time}`, etc. substitute:

```typescript
// lib/i18n/index.ts — within useI18nProvider()
const t = useCallback(
  (key: string, vars?: Record<string, string | number>): string => {
    let s = translations[locale][key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  },
  [locale],
);

// and makeT:
export function makeT(locale: Locale): (key: string, vars?: Record<string, string | number>) => string {
  return (key, vars) => {
    let s = translations[locale][key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}
```

Update the `I18nContextType` and the default in `I18nContext` to the new signature.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (existing callers using `t('key')` without vars continue to work).

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/zh.ts lib/i18n/en.ts lib/i18n/index.ts
git commit -m "feat(i18n): add capture-feature strings; support placeholder vars"
```

---

## Task 17: Toolbar toast component

**Files:**
- Create: `components/capture/ToolbarToast.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/capture/ToolbarToast.tsx
import React, { useEffect } from 'react';

interface ToolbarToastProps {
  message: string;
  variant?: 'info' | 'success' | 'warn' | 'error';
  onDismiss: () => void;
  /** ms before auto-dismissing; default 4000 */
  timeoutMs?: number;
}

const VARIANT_BG: Record<NonNullable<ToolbarToastProps['variant']>, string> = {
  info: '#1e1e3a',
  success: '#166534',
  warn: '#92400e',
  error: '#7f1d1d',
};

export default function ToolbarToast({
  message, variant = 'info', onDismiss, timeoutMs = 4000,
}: ToolbarToastProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(id);
  }, [onDismiss, timeoutMs]);

  const style: React.CSSProperties = {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: '8px',
    backgroundColor: VARIANT_BG[variant],
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    maxWidth: '260px',
    whiteSpace: 'normal',
    zIndex: 999999,
  };

  return <div style={style}>{message}</div>;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/capture/ToolbarToast.tsx
git commit -m "feat(capture): add toolbar toast component"
```

---

## Task 18: Save menu component

**Files:**
- Create: `components/capture/SaveMenu.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/capture/SaveMenu.tsx
import React, { useEffect, useRef } from 'react';

interface SaveMenuProps {
  t: (key: string) => string;
  hasActiveResume: boolean;
  onSaveDraft: () => void;
  onWriteBack: () => void;
  onSaveMemory: () => void;
  onClose: () => void;
}

export default function SaveMenu({
  t, hasActiveResume, onSaveDraft, onWriteBack, onSaveMemory, onClose,
}: SaveMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '4px',
    backgroundColor: '#1e1e3a',
    border: '1px solid #374151',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    minWidth: '180px',
    overflow: 'hidden',
    zIndex: 999999,
  };

  const itemStyle = (enabled: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    padding: '8px 14px',
    background: 'none',
    border: 'none',
    color: enabled ? '#e5e7eb' : '#6b7280',
    textAlign: 'left',
    fontSize: '13px',
    cursor: enabled ? 'pointer' : 'not-allowed',
    whiteSpace: 'nowrap',
  });

  return (
    <div ref={ref} style={containerStyle}>
      <button
        style={itemStyle(true)}
        onClick={(e) => { e.stopPropagation(); onSaveDraft(); }}
      >
        {t('capture.menu.draft')}
      </button>
      <button
        style={itemStyle(hasActiveResume)}
        disabled={!hasActiveResume}
        title={!hasActiveResume ? t('capture.toast.noActiveResume') : undefined}
        onClick={(e) => { e.stopPropagation(); if (hasActiveResume) onWriteBack(); }}
      >
        {t('capture.menu.writeback')}
      </button>
      <button
        style={itemStyle(true)}
        onClick={(e) => { e.stopPropagation(); onSaveMemory(); }}
      >
        {t('capture.menu.memory')}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/capture/SaveMenu.tsx
git commit -m "feat(capture): add save-mode selection menu"
```

---

## Task 19: Toolbar [💾] button integration

**Files:**
- Modify: `components/toolbar/FloatingToolbar.tsx`
- Modify: `components/toolbar/mount.tsx`

- [ ] **Step 1: Extend FloatingToolbar with a save button**

Modify `components/toolbar/FloatingToolbar.tsx` — extend the props interface and render logic:

```tsx
// At the top of the file, extend the props interface:
interface FloatingToolbarProps {
  onPositionChange: (pos: { x: number; y: number }) => void;
  onFill: () => void;
  filling: boolean;
  fillResult: { filled: number; total: number } | null;
  onToggleResult: () => void;
  onToggleSaveMenu: () => void;
  saveMenuOpen: boolean;
  t: (key: string) => string;
}

// In the JSX return, append a third button after the progress button:
<button
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: saveMenuOpen ? '#6b7280' : '#4b5563',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none',
    whiteSpace: 'nowrap',
  }}
  onClick={(e) => {
    e.stopPropagation();
    onToggleSaveMenu();
  }}
  title={t('toolbar.save')}
>
  💾
</button>
```

Also destructure `onToggleSaveMenu, saveMenuOpen` from props at the top of the function.

- [ ] **Step 2: Wire it up in mount.tsx**

Update `components/toolbar/mount.tsx`:

```tsx
// Add imports
import SaveMenu from '@/components/capture/SaveMenu';
import ToolbarToast from '@/components/capture/ToolbarToast';

// Extend ToolbarAppProps:
interface ToolbarAppProps {
  initialPosition: { x: number; y: number };
  onPositionSave: (pos: { x: number; y: number }) => void;
  onFill: () => Promise<FillResult>;
  onSaveDraft: () => Promise<{ ok: boolean; msg: string }>;
  onWriteBack: () => Promise<{ ok: boolean; msg: string }>;
  onSaveMemory: () => Promise<{ ok: boolean; msg: string }>;
  getHasActiveResume: () => boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function ToolbarApp({
  initialPosition, onPositionSave, onFill,
  onSaveDraft, onWriteBack, onSaveMemory, getHasActiveResume, t,
}: ToolbarAppProps) {
  const [pos, setPos] = useState(initialPosition);
  const [filling, setFilling] = useState(false);
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handlePositionChange = useCallback((delta: { x: number; y: number }) => {
    setPos((prev) => {
      const next = { x: Math.max(0, prev.x + delta.x), y: Math.max(0, prev.y + delta.y) };
      onPositionSave(next);
      return next;
    });
  }, [onPositionSave]);

  const handleFill = useCallback(async () => {
    if (filling) return;
    setFilling(true);
    try {
      const result = await onFill();
      setFillResult(result);
      setShowResult(true);
    } finally { setFilling(false); }
  }, [filling, onFill]);

  async function run(cb: () => Promise<{ ok: boolean; msg: string }>) {
    setMenuOpen(false);
    const { msg } = await cb();
    setToast(msg);
  }

  const total = fillResult
    ? fillResult.filled + fillResult.uncertain + fillResult.unrecognized
    : 0;

  const wrapperStyle: React.CSSProperties = {
    position: 'fixed', left: pos.x, bottom: pos.y, zIndex: 999999,
  };

  return (
    <div style={wrapperStyle}>
      {showResult && fillResult && (
        <ResultBubble result={fillResult} onClose={() => setShowResult(false)} t={t} />
      )}
      {toast && <ToolbarToast message={toast} onDismiss={() => setToast(null)} />}
      <div style={{ position: 'relative' }}>
        <FloatingToolbar
          onPositionChange={handlePositionChange}
          onFill={handleFill}
          filling={filling}
          fillResult={fillResult ? { filled: fillResult.filled, total } : null}
          onToggleResult={() => setShowResult((v) => !v)}
          onToggleSaveMenu={() => setMenuOpen((v) => !v)}
          saveMenuOpen={menuOpen}
          t={t}
        />
        {menuOpen && (
          <SaveMenu
            t={t}
            hasActiveResume={getHasActiveResume()}
            onSaveDraft={() => run(onSaveDraft)}
            onWriteBack={() => run(onWriteBack)}
            onSaveMemory={() => run(onSaveMemory)}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

export interface ToolbarMountOptions {
  ctx: InstanceType<typeof ContentScriptContext>;
  initialPosition: { x: number; y: number };
  onPositionSave: (pos: { x: number; y: number }) => void;
  onFill: () => Promise<FillResult>;
  onSaveDraft: () => Promise<{ ok: boolean; msg: string }>;
  onWriteBack: () => Promise<{ ok: boolean; msg: string }>;
  onSaveMemory: () => Promise<{ ok: boolean; msg: string }>;
  getHasActiveResume: () => boolean;
}

export async function mountToolbar(options: ToolbarMountOptions) {
  const stored = await chrome.storage.local.get('formpilot:locale');
  const locale = (stored['formpilot:locale'] === 'en') ? 'en' : 'zh';
  const t = makeT(locale);

  const ui = await createShadowRootUi(options.ctx, {
    name: 'formpilot-toolbar',
    position: 'modal',
    zIndex: 999999,
    onMount(container) {
      const root = ReactDOM.createRoot(container);
      root.render(
        <ToolbarApp
          initialPosition={options.initialPosition}
          onPositionSave={options.onPositionSave}
          onFill={options.onFill}
          onSaveDraft={options.onSaveDraft}
          onWriteBack={options.onWriteBack}
          onSaveMemory={options.onSaveMemory}
          getHasActiveResume={options.getHasActiveResume}
          t={t}
        />,
      );
      return root;
    },
    onRemove(root) { root?.unmount(); },
  });

  ui.mount();
  return { unmount: () => ui.remove() };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: content.ts will now FAIL — it hasn't been updated. That's fine; Task 21 fixes it. Commit this WIP now as a new commit and move on.

Actually: don't commit broken state. Park this change locally and proceed to Task 20 and 21 first, then commit Tasks 19-21 together after content.ts is updated.

---

## Task 20: Draft badge component

**Files:**
- Create: `components/capture/DraftBadge.tsx`
- Create: `components/capture/mount-badge.tsx`

- [ ] **Step 1: Write the badge component**

```tsx
// components/capture/DraftBadge.tsx
import React, { useState } from 'react';
import type { DraftSnapshot } from '@/lib/capture/types';
import { formatRelativeTime } from '@/lib/capture/time-format';

interface DraftBadgeProps {
  snapshot: DraftSnapshot;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onRestore: () => Promise<{ filled: number; total: number }>;
  onRestoreAndFill: () => Promise<{ filled: number; total: number }>;
  onIgnore: () => void;
  onDelete: () => void;
}

export default function DraftBadge({
  snapshot, t, onRestore, onRestoreAndFill, onIgnore, onDelete,
}: DraftBadgeProps) {
  const [hidden, setHidden] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (hidden) return null;

  const handle = async (fn: () => Promise<{ filled: number; total: number }>) => {
    const { filled, total } = await fn();
    setStatus(t('capture.badge.restored', { filled, total }));
  };

  const wrapStyle: React.CSSProperties = {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: 2147483647,
    backgroundColor: '#1e1e3a',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: '8px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    fontSize: '13px',
    maxWidth: '360px',
    fontFamily: 'system-ui, sans-serif',
  };

  const btn = (bg: string): React.CSSProperties => ({
    backgroundColor: bg, color: '#fff', border: 'none',
    borderRadius: '6px', padding: '6px 10px', fontSize: '12px',
    cursor: 'pointer', marginRight: '6px', marginTop: '6px',
  });

  const closeStyle: React.CSSProperties = {
    position: 'absolute', top: '4px', right: '6px',
    background: 'none', border: 'none', color: '#9ca3af',
    fontSize: '14px', cursor: 'pointer',
  };

  const time = formatRelativeTime(snapshot.savedAt, Date.now(), t);

  return (
    <div style={wrapStyle}>
      <button style={closeStyle} onClick={() => { setHidden(true); onIgnore(); }}>✕</button>
      <div>
        {status ?? t('capture.badge.detected', { n: snapshot.fields.length, time })}
      </div>
      {!status && (
        <div>
          <button style={btn('#3b82f6')} onClick={() => handle(onRestore)}>
            {t('capture.badge.restore')}
          </button>
          <button style={btn('#8b5cf6')} onClick={() => handle(onRestoreAndFill)}>
            {t('capture.badge.restoreAndFill')}
          </button>
          <button style={btn('#374151')} onClick={() => { setHidden(true); onIgnore(); }}>
            {t('capture.badge.ignore')}
          </button>
          <button style={btn('#dc2626')} onClick={() => { setHidden(true); onDelete(); }}>
            {t('capture.badge.delete')}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the mount helper**

```tsx
// components/capture/mount-badge.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import DraftBadge from './DraftBadge';
import type { DraftSnapshot } from '@/lib/capture/types';
import { makeT } from '@/lib/i18n';

export interface DraftBadgeMountOptions {
  ctx: InstanceType<typeof ContentScriptContext>;
  snapshot: DraftSnapshot;
  onRestore: () => Promise<{ filled: number; total: number }>;
  onRestoreAndFill: () => Promise<{ filled: number; total: number }>;
  onIgnore: () => void;
  onDelete: () => void;
}

export async function mountDraftBadge(opts: DraftBadgeMountOptions): Promise<{ unmount: () => void }> {
  const stored = await chrome.storage.local.get('formpilot:locale');
  const locale = (stored['formpilot:locale'] === 'en') ? 'en' : 'zh';
  const t = makeT(locale);

  const ui = await createShadowRootUi(opts.ctx, {
    name: 'formpilot-draft-badge',
    position: 'modal',
    zIndex: 2147483647,
    onMount(container) {
      const root = ReactDOM.createRoot(container);
      root.render(
        <DraftBadge
          snapshot={opts.snapshot}
          t={t}
          onRestore={opts.onRestore}
          onRestoreAndFill={opts.onRestoreAndFill}
          onIgnore={opts.onIgnore}
          onDelete={opts.onDelete}
        />,
      );
      return root;
    },
    onRemove(root) { root?.unmount(); },
  });

  ui.mount();
  return { unmount: () => ui.remove() };
}
```

---

## Task 21: Wire content script

**Files:**
- Modify: `entrypoints/content.ts`

- [ ] **Step 1: Replace the `main()` body**

Add this replacement (imports at the top, then the new `main` function). This folds together: mount new toolbar (with save handlers), query + mount draft badge, pass page memory into `orchestrateFill`, and extend `applyFieldHighlights` colors.

```typescript
// entrypoints/content.ts
import { findAdapter } from '@/lib/engine/adapters/registry';
import { orchestrateFill } from '@/lib/engine/orchestrator';
import type { FillResult } from '@/lib/engine/adapters/types';
import type { Resume, Settings } from '@/lib/storage/types';
import type { DraftSnapshot, PageMemoryEntry } from '@/lib/capture/types';
import { mountToolbar } from '@/components/toolbar/mount';
import { mountDraftBadge } from '@/components/capture/mount-badge';
import { serializeFields } from '@/lib/capture/serializer';
import { restoreFields } from '@/lib/capture/restorer';
import { scanFields } from '@/lib/engine/scanner';
import { collectWriteBack } from '@/lib/capture/writeback';
import { normalizeUrlForDraft, normalizeUrlForMemory } from '@/lib/capture/url-key';
import { makeT } from '@/lib/i18n';

export default defineContentScript({
  matches: [
    '*://*.mokahr.com/*', '*://*.moka.com/*', '*://*.zhaopin.com/*',
    '*://*.liepin.com/*', '*://*.zhipin.com/*', '*://*.lagou.com/*',
    '*://*.nowcoder.com/*', '*://*.myworkday.com/*', '*://*.myworkdayjobs.com/*',
    '*://*.greenhouse.io/*', '*://*.lever.co/*', '*://*.icims.com/*',
    '*://*.taleo.net/*', '*://*.smartrecruiters.com/*', '*://*.hotjob.cn/*',
    '*://*.beisen.com/*', '*://*.feishu.cn/*',
    '*://*.com/careers/*', '*://*.com/jobs/*', '*://*.com/apply/*',
    '*://*.cn/careers/*', '*://*.cn/jobs/*',
  ],
  cssInjectionMode: 'ui',

  async main(ctx) {
    await new Promise((r) => setTimeout(r, 1000));
    const hasFormElements = document.querySelectorAll('input, select, textarea').length > 3;
    if (!hasFormElements) return;

    // Load settings
    let settings: Settings | null = null;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (res?.ok) settings = res.data as Settings;
    } catch { /* default */ }

    const stored = await chrome.storage.local.get('formpilot:locale');
    const locale = (stored['formpilot:locale'] === 'en') ? 'en' : 'zh';
    const t = makeT(locale);

    const DEFAULT_POSITION = { x: 16, y: 80 };
    const initialPosition = settings?.toolbarPosition ?? DEFAULT_POSITION;
    const skipSensitive = settings?.skipSensitive ?? true;

    // Cache active resume flag (refreshed lazily)
    let hasActive = false;

    async function fetchActiveResume(): Promise<Resume | null> {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_RESUME' });
        if (res?.ok) {
          hasActive = !!res.data;
          return res.data as Resume | null;
        }
      } catch { /* ignore */ }
      return null;
    }

    async function fetchPageMemory(): Promise<PageMemoryEntry[]> {
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'GET_PAGE_MEMORY',
          url: normalizeUrlForMemory(window.location.href),
        });
        if (res?.ok) return (res.data as PageMemoryEntry[]) ?? [];
      } catch { /* ignore */ }
      return [];
    }

    // ── Fill handler ──────────────────────────────────────────────
    async function handleFill(): Promise<FillResult> {
      const resume = await fetchActiveResume();
      if (!resume) return { items: [], filled: 0, uncertain: 0, unrecognized: 0 };
      const adapter = findAdapter(window.location.href);
      const memory = await fetchPageMemory();
      const result = await orchestrateFill(document, resume, adapter, memory);
      applyFieldHighlights(result);
      return result;
    }

    // ── Save-mode handlers ────────────────────────────────────────
    async function handleSaveDraft(): Promise<{ ok: boolean; msg: string }> {
      const { fields, skipped } = serializeFields(document, { skipSensitive });
      try {
        await chrome.runtime.sendMessage({
          type: 'SAVE_DRAFT',
          url: normalizeUrlForDraft(window.location.href),
          fields,
        });
        const msg = skipped > 0
          ? t('capture.toast.draft.partial', { n: fields.length, m: skipped })
          : t('capture.toast.draft.saved', { n: fields.length });
        return { ok: true, msg };
      } catch {
        return { ok: false, msg: t('capture.toast.storageFull') };
      }
    }

    async function handleWriteBack(): Promise<{ ok: boolean; msg: string }> {
      const resume = await fetchActiveResume();
      if (!resume) return { ok: false, msg: t('capture.toast.noActiveResume') };
      const adapter = findAdapter(window.location.href);
      const items = await scanFields(document, adapter);
      const pairs = collectWriteBack(items);
      if (pairs.length === 0) return { ok: false, msg: t('capture.toast.nothingToWriteBack') };
      const res = await chrome.runtime.sendMessage({ type: 'WRITE_BACK_TO_RESUME', pairs });
      if (res?.ok) {
        return {
          ok: true,
          msg: t('capture.toast.writeback.done', { n: res.data.updated, name: res.data.name }),
        };
      }
      return { ok: false, msg: t('capture.toast.storageFull') };
    }

    async function handleSaveMemory(): Promise<{ ok: boolean; msg: string }> {
      const { fields } = serializeFields(document, { skipSensitive });
      try {
        await chrome.runtime.sendMessage({
          type: 'SAVE_PAGE_MEMORY',
          url: normalizeUrlForMemory(window.location.href),
          fields,
        });
        return { ok: true, msg: t('capture.toast.memory.saved', { n: fields.length }) };
      } catch {
        return { ok: false, msg: t('capture.toast.storageFull') };
      }
    }

    function savePosition(pos: { x: number; y: number }) {
      chrome.runtime.sendMessage({ type: 'SAVE_TOOLBAR_POSITION', position: pos }).catch(() => {});
    }

    // ── Mount toolbar ─────────────────────────────────────────────
    await fetchActiveResume(); // prime hasActive
    const toolbar = await mountToolbar({
      ctx,
      initialPosition,
      onPositionSave: savePosition,
      onFill: handleFill,
      onSaveDraft: handleSaveDraft,
      onWriteBack: handleWriteBack,
      onSaveMemory: handleSaveMemory,
      getHasActiveResume: () => hasActive,
    });

    // ── Draft badge ───────────────────────────────────────────────
    let badge: { unmount: () => void } | null = null;
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'GET_DRAFT',
        url: normalizeUrlForDraft(window.location.href),
      });
      const snapshot = res?.ok ? (res.data as DraftSnapshot | null) : null;
      if (snapshot) {
        badge = await mountDraftBadge({
          ctx,
          snapshot,
          onRestore: async () => {
            const { restored, missing } = restoreFields(document, snapshot.fields);
            applyDraftHighlights(snapshot.fields);
            return { filled: restored, total: restored + missing };
          },
          onRestoreAndFill: async () => {
            const { restored, missing } = restoreFields(document, snapshot.fields);
            applyDraftHighlights(snapshot.fields);
            await handleFill();
            return { filled: restored, total: restored + missing };
          },
          onIgnore: () => { badge?.unmount(); },
          onDelete: async () => {
            await chrome.runtime.sendMessage({
              type: 'DELETE_DRAFT',
              url: normalizeUrlForDraft(window.location.href),
            });
            badge?.unmount();
          },
        });
      }
    } catch { /* no badge */ }

    // ── TRIGGER_FILL listener ─────────────────────────────────────
    chrome.runtime.onMessage.addListener((message, _s, sendResponse) => {
      if (message.type === 'TRIGGER_FILL') {
        handleFill().then((result) => sendResponse({ ok: true, data: result }));
        return true;
      }
    });

    // ── Observe form changes ─────────────────────────────────────
    const cleanup = observeFormChanges(ctx, handleFill);

    ctx.onInvalidated(() => {
      cleanup();
      toolbar.unmount();
      badge?.unmount();
    });
  },
});

// ─── Field Highlights ────────────────────────────────────────────
function applyFieldHighlights(result: FillResult): void {
  const colors: Record<string, string> = {
    filled: '0 0 0 2px #4ade80',
    uncertain: '0 0 0 2px #f59e0b',
    unrecognized: '0 0 0 2px #ef4444',
  };
  for (const item of result.items) {
    if (!item.element || !(item.element instanceof HTMLElement)) continue;
    const el = item.element;
    el.removeAttribute('data-formpilot-status');
    if (item.source === 'memory' && item.status === 'filled') {
      el.style.boxShadow = '0 0 0 2px #a855f7'; // purple for memory
      el.setAttribute('data-formpilot-status', 'memory');
    } else {
      el.style.boxShadow = colors[item.status] ?? '';
      el.setAttribute('data-formpilot-status', item.status);
    }
  }
}

function applyDraftHighlights(fields: Array<{ selector: string; signature: string; index: number }>): void {
  const all = Array.from(document.querySelectorAll<HTMLElement>('input, textarea, select'));
  const restored = all.filter((el) => el.getAttribute('data-formpilot-restored') === 'draft');
  for (const el of restored) {
    el.style.boxShadow = '0 0 0 2px #22d3ee'; // cyan for draft
    el.setAttribute('data-formpilot-status', 'draft');
  }
  void fields; // signature not needed here; marker set by restorer
}

function observeFormChanges(
  ctx: InstanceType<typeof ContentScriptContext>,
  onFill: () => void,
): () => void {
  let lastUrl = window.location.href;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const mutationObserver = new MutationObserver((mutations) => {
    const hasNew = mutations.some((m) =>
      Array.from(m.addedNodes).some(
        (node) =>
          node instanceof HTMLElement &&
          (node.querySelector('input, select, textarea') || node.matches?.('input, select, textarea')),
      ),
    );
    if (hasNew) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => onFill(), 800);
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  const intervalId = ctx.setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      document.querySelectorAll<HTMLElement>('[data-formpilot-status]').forEach((el) => {
        el.style.boxShadow = '';
        el.removeAttribute('data-formpilot-status');
      });
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => onFill(), 800);
    }
  }, 1000);

  return () => {
    mutationObserver.disconnect();
    clearTimeout(debounceTimer);
    clearInterval(intervalId);
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: build succeeds.

- [ ] **Step 4: Run full test suite**

Run: `pnpm run test`
Expected: all tests pass.

- [ ] **Step 5: Commit (bundled with Tasks 19 + 20)**

```bash
git add components/toolbar/FloatingToolbar.tsx components/toolbar/mount.tsx \
  components/capture/DraftBadge.tsx components/capture/mount-badge.tsx \
  entrypoints/content.ts
git commit -m "feat(content): add save button, draft badge, and memory fallback integration"
```

---

## Task 22: Dashboard Saved Pages section

**Files:**
- Create: `components/popup/sections/SavedPages.tsx`
- Modify: `components/popup/Sidebar.tsx`
- Modify: `entrypoints/dashboard/App.tsx`

- [ ] **Step 1: Write the section component**

```tsx
// components/popup/sections/SavedPages.tsx
import React, { useCallback, useEffect, useState } from 'react';
import type { DraftSnapshot, PageMemoryEntry } from '@/lib/capture/types';
import { useI18n } from '@/lib/i18n';
import { formatRelativeTime } from '@/lib/capture/time-format';

type SubTab = 'drafts' | 'memory';

export default function SavedPagesSection() {
  const { t } = useI18n();
  const [tab, setTab] = useState<SubTab>('drafts');
  const [drafts, setDrafts] = useState<DraftSnapshot[]>([]);
  const [memory, setMemory] = useState<Record<string, PageMemoryEntry[]>>({});

  const refresh = useCallback(async () => {
    const [d, m] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'LIST_DRAFTS' }),
      chrome.runtime.sendMessage({ type: 'LIST_PAGE_MEMORY' }),
    ]);
    setDrafts(d?.ok ? (d.data as DraftSnapshot[]) : []);
    setMemory(m?.ok ? (m.data as Record<string, PageMemoryEntry[]>) : {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const deleteDraft = async (url: string) => {
    await chrome.runtime.sendMessage({ type: 'DELETE_DRAFT', url });
    refresh();
  };
  const deleteMemory = async (url: string) => {
    await chrome.runtime.sendMessage({ type: 'DELETE_PAGE_MEMORY', url });
    refresh();
  };

  const now = Date.now();

  return (
    <div className="text-sm">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('drafts')}
          className={`px-3 py-1 rounded ${tab === 'drafts' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400'}`}
        >
          {t('savedPages.drafts.title')} ({drafts.length})
        </button>
        <button
          onClick={() => setTab('memory')}
          className={`px-3 py-1 rounded ${tab === 'memory' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400'}`}
        >
          {t('savedPages.memory.title')} ({Object.keys(memory).length})
        </button>
      </div>

      {tab === 'drafts' && (
        drafts.length === 0 ? (
          <div className="text-gray-500">{t('savedPages.drafts.empty')}</div>
        ) : (
          <table className="w-full">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left p-1">{t('savedPages.column.url')}</th>
                <th className="text-left p-1">{t('savedPages.column.savedAt')}</th>
                <th className="text-left p-1">{t('savedPages.column.fields')}</th>
                <th className="text-left p-1">{t('savedPages.column.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.url} className="border-t border-gray-800">
                  <td className="p-1 truncate max-w-xs" title={d.url}>{d.url}</td>
                  <td className="p-1">{formatRelativeTime(d.savedAt, now, t)}</td>
                  <td className="p-1">{d.fields.length}</td>
                  <td className="p-1">
                    <button
                      onClick={() => deleteDraft(d.url)}
                      className="text-red-400 hover:text-red-300"
                    >
                      {t('savedPages.action.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {tab === 'memory' && (
        Object.keys(memory).length === 0 ? (
          <div className="text-gray-500">{t('savedPages.memory.empty')}</div>
        ) : (
          <table className="w-full">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left p-1">{t('savedPages.column.url')}</th>
                <th className="text-left p-1">{t('savedPages.column.fields')}</th>
                <th className="text-left p-1">{t('savedPages.column.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(memory).map(([url, entries]) => (
                <tr key={url} className="border-t border-gray-800">
                  <td className="p-1 truncate max-w-xs" title={url}>{url}</td>
                  <td className="p-1">{entries.length}</td>
                  <td className="p-1">
                    <button
                      onClick={() => deleteMemory(url)}
                      className="text-red-400 hover:text-red-300"
                    >
                      {t('savedPages.action.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add new nav item to Sidebar**

In `components/popup/Sidebar.tsx`:

```typescript
// Extend SectionId
export type SectionId =
  | 'basic' | 'education' | 'work' | 'projects'
  | 'skills' | 'jobPreference' | 'custom'
  | 'savedPages'  // NEW
  | 'settings';

// In NAV_ITEMS array, append after 'custom' (before the Settings footer):
{ id: 'savedPages' as SectionId, label: t('nav.savedPages') },
```

- [ ] **Step 3: Route in dashboard App.tsx**

In `entrypoints/dashboard/App.tsx`:

```tsx
// import
import SavedPagesSection from '@/components/popup/sections/SavedPages';

// In renderContent(): add a branch BEFORE the `if (!activeResume)` check
if (section === 'settings') return <SettingsSection />;
if (section === 'savedPages') return <SavedPagesSection />;
// then the existing !activeResume guard and the switch
```

Also extend the hash-routing allowlist:

```typescript
if (hash && ['basic','education','work','projects','skills','jobPreference','custom','savedPages','settings'].includes(hash)) {
  setSection(hash as SectionId);
}
```

- [ ] **Step 4: Typecheck and build**

```
pnpm exec tsc --noEmit
pnpm run build
```

- [ ] **Step 5: Commit**

```bash
git add components/popup/sections/SavedPages.tsx components/popup/Sidebar.tsx entrypoints/dashboard/App.tsx
git commit -m "feat(dashboard): add Saved Pages section with draft/memory lists"
```

---

## Task 23: Settings toggle for skipSensitive

**Files:**
- Modify: `components/popup/sections/Settings.tsx`

- [ ] **Step 1: Read the existing Settings section**

```bash
# Before editing, inspect:
# components/popup/sections/Settings.tsx
```

- [ ] **Step 2: Add a Capture subsection with the toggle**

Near the bottom of the existing form (after API settings), insert:

```tsx
{/* Capture subsection */}
<div className="mt-6 border-t border-gray-800 pt-4">
  <h3 className="text-sm font-semibold mb-2">{t('settings.capture.title')}</h3>
  <label className="flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={settings.skipSensitive}
      onChange={(e) =>
        updateSettings({ skipSensitive: e.target.checked }).then(loadSettings)
      }
    />
    <span>{t('settings.capture.skipSensitive')}</span>
  </label>
</div>
```

(If the existing component uses a different state pattern, wire the toggle to that pattern. The key is: call `updateSettings({ skipSensitive: ... })` on change and refresh local state.)

- [ ] **Step 3: Typecheck**

```
pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/popup/sections/Settings.tsx
git commit -m "feat(settings): add skipSensitive toggle under Capture section"
```

---

## Task 24: Final verification

**Files:** (none modified)

- [ ] **Step 1: Full test suite**

Run: `pnpm run test`
Expected: all tests pass, including the 48 pre-existing + ~45 new cases.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `pnpm run build`
Expected: build completes; `.output/chrome-mv3` populated.

- [ ] **Step 4: Smoke test checklist** (manual, load unpacked into Chrome)

- Open any supported job page (or a page with >3 form inputs).
- Toolbar shows `[⚡] [3/8] [💾]`.
- Fill some inputs manually.
- Click `[💾] → 📝 保存草稿` → toast appears.
- Reload the page → top-right badge appears.
- Click `[恢复]` → fields come back; badge shows `已恢复 N/M`.
- Click `[💾] → ↩️ 写回简历` → toast; open Dashboard and see the resume updated.
- Click `[💾] → 🧠 记住本页作答` → toast.
- Refresh; unrecognized fields now show purple border and are pre-filled from memory.
- Dashboard → Saved Pages tab lists both drafts and memory entries; delete works.
- Settings → skipSensitive toggle off → id-card-like fields save through.

- [ ] **Step 5: Final commit summary check**

```bash
git log --oneline main..HEAD
```

Expected: roughly 20 feature commits, each small and focused.

---

## Appendix: Self-Review Notes

**Spec coverage vs plan:**

| Spec section | Tasks |
|--------------|-------|
| §3.1 CapturedField | Task 1 |
| §3.2 DraftSnapshot + 30-day TTL | Tasks 1, 5 |
| §3.3 PageMemoryEntry | Tasks 1, 6 |
| §3.4 Settings.skipSensitive | Task 14 |
| §3.5 URL normalization | Task 2 |
| §3.6 Sensitive + size limits | Task 3 |
| §4 Module layout | Tasks 1–13 |
| §4 Message protocol | Task 15 |
| §5.1 Save/restore draft | Tasks 7, 9, 21 |
| §5.2 Write-back | Tasks 8, 11, 15, 21 |
| §5.3 Page memory + Phase 3 | Tasks 6, 12, 13, 21 |
| §6 UI (toolbar, badge, menu, colors) | Tasks 17, 18, 19, 20, 21 |
| §6.5 Dashboard | Task 22 |
| §6.6 Relative time | Task 4 |
| §7 i18n keys | Task 16 |
| §8 Tests | Tasks 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13 |
| §9 Boundaries (no active resume, storage full, etc.) | Tasks 15, 18, 21 |
| §10 Migration | Tasks 5, 6, 14 (all use defaults / `?? {}`) |

**Gaps found during self-review:** none — every spec section maps to at least one task. One simplification vs. the spec:
- Draft "ignore" state doesn't need a separate per-URL dismissed flag — clicking `×` or `忽略` just unmounts the badge component instance. On next page reload the badge reappears, which is intentional: ignore is session-scoped, matching user expectation for "remind me later."

**Type & name consistency check:** `scanFields` used in both Tasks 10, 11, 12, 13, 21 — consistent. `ScannedItem.status` values `'recognized' | 'unrecognized'` — consistent across Tasks 10–13. `CapturedField.index` described identically (same-signature DOM-order ordinal) in Tasks 1, 7, 9, 12. `FillSource` extended to include `'memory'` in Task 12, then used in Tasks 13, 21.

**Placeholder scan:** no TBDs or vague "add error handling" notes remain — every error path has explicit code (try/catch + toast string, or guard + early return).

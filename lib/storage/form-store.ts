import type { CapturedField, CapturedFieldKind } from '@/lib/capture/types';

const KEY = 'formpilot:formEntries';

/**
 * A cross-URL form-field entry learned from the user's past interactions.
 * Keyed by the field's signature (hash of label|placeholder|aria-label),
 * so the same field on different sites shares a single remembered value.
 *
 * Orthogonal to `formpilot:pageMemory` (per-URL, exact) — this store is
 * coarser and is consulted after page memory as a last-resort Phase 4 fill.
 */
export interface FormEntry {
  signature: string;
  kind: CapturedFieldKind;
  /** Internal value — same as CapturedField.value. */
  value: string;
  /** User-visible option text (radio/select). See CapturedField.displayValue. */
  displayValue?: string;
  /** Last-seen human label — for Dashboard display, not matching. */
  label: string;
  /** Last URL that contributed this entry. */
  lastUrl: string;
  updatedAt: number;
  /** How many times this signature has been saved. Higher = more trusted. */
  hitCount: number;
}

async function readAll(): Promise<Record<string, FormEntry>> {
  const res = await chrome.storage.local.get(KEY);
  return (res[KEY] as Record<string, FormEntry> | undefined) ?? {};
}

async function writeAll(all: Record<string, FormEntry>): Promise<void> {
  await chrome.storage.local.set({ [KEY]: all });
}

/**
 * Upsert form entries from a captured snapshot. Silently skips fields where
 * both value and displayValue would be empty (uncommitted form state).
 *
 * A single page may expose multiple fields with the same signature (e.g.
 * three "Email" inputs). They are logically one remembered entry — dedupe
 * by signature before writing so hitCount advances once per save, not
 * once per physical field. Last occurrence in the array wins its value.
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
    const prior = all[sig];
    all[sig] = {
      signature: sig,
      kind: f.kind,
      value: f.value,
      displayValue: f.displayValue,
      label: f.label,
      lastUrl: sourceUrl,
      updatedAt: now,
      hitCount: (prior?.hitCount ?? 0) + 1,
    };
    saved++;
  }
  await writeAll(all);
  return saved;
}

export async function getFormEntry(signature: string): Promise<FormEntry | null> {
  const all = await readAll();
  return all[signature] ?? null;
}

export async function listFormEntries(): Promise<Record<string, FormEntry>> {
  return readAll();
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

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

/**
 * Save (overwrite) the draft for the given URL. Opportunistically GC expired
 * entries in the same write so long-unused URLs don't silently hog storage
 * quota even for users who never open the Dashboard listing.
 */
export async function saveDraft(url: string, fields: CapturedField[]): Promise<void> {
  const all = await readAll();
  const now = Date.now();
  for (const [u, snap] of Object.entries(all)) {
    if (isExpired(snap, now)) delete all[u];
  }
  all[url] = { url, savedAt: now, fields };
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

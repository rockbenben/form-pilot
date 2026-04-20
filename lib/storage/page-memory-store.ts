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

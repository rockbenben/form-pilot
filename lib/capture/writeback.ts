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
    while (arr.length <= idx) arr.push({});
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

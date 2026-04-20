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

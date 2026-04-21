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

  it('opportunistically GCs expired drafts on save', async () => {
    await saveDraft('https://stale.com/', fields);
    const store = await chrome.storage.local.get('formpilot:drafts');
    const raw = store['formpilot:drafts'] as Record<string, { savedAt: number }>;
    raw['https://stale.com/'].savedAt = Date.now() - DRAFT_TTL_MS - 1;
    await chrome.storage.local.set({ 'formpilot:drafts': raw });

    await saveDraft('https://new.com/', fields);
    const after = await chrome.storage.local.get('formpilot:drafts');
    const keys = Object.keys(after['formpilot:drafts'] as object);
    expect(keys.sort()).toEqual(['https://new.com/']);
  });
});

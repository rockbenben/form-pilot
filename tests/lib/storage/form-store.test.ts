import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveFormEntries,
  getFormEntry,
  listFormEntries,
  clearAllFormEntries,
} from '@/lib/storage/form-store';
import type { CapturedField } from '@/lib/capture/types';

const mk = (
  sig: string,
  value: string,
  kind: CapturedField['kind'],
  displayValue?: string,
): CapturedField => ({
  selector: `#${sig}`,
  index: 0,
  kind,
  value,
  displayValue,
  signature: sig,
  label: sig,
});

describe('form-store · save path', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('creates a new entry with one candidate on first save', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    expect(entry).not.toBeNull();
    expect(entry!.candidates).toHaveLength(1);
    expect(entry!.candidates[0].value).toBe('a@x.com');
    expect(entry!.candidates[0].hitCount).toBe(1);
    expect(entry!.candidates[0].lastUrl).toBe('https://a.com/');
    expect(entry!.pinnedId).toBeNull();
    expect(entry!.candidates[0].id).toMatch(/[0-9a-f-]{36}/i);
  });

  it('bumps the existing candidate when saved (value, displayValue) matches', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    expect(entry!.candidates).toHaveLength(1);
    expect(entry!.candidates[0].hitCount).toBe(2);
    expect(entry!.candidates[0].lastUrl).toBe('https://b.com/');
  });

  it('appends a new candidate when (value, displayValue) differs', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'b@y.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    expect(entry!.candidates).toHaveLength(2);
    const values = entry!.candidates.map((c) => c.value).sort();
    expect(values).toEqual(['a@x.com', 'b@y.com']);
  });

  it('treats (value, displayValue) together as the dedupe key', async () => {
    await saveFormEntries([mk('gender', '1', 'radio', '男')], 'https://a.com/');
    await saveFormEntries([mk('gender', '1', 'radio', 'Male')], 'https://b.com/');
    const entry = await getFormEntry('gender');
    expect(entry!.candidates).toHaveLength(2);
  });

  it('refreshes the entry label on save', async () => {
    await saveFormEntries(
      [{ ...mk('x', 'v', 'text'), label: 'Old Label' }],
      'https://a.com/',
    );
    await saveFormEntries(
      [{ ...mk('x', 'v', 'text'), label: 'New Label' }],
      'https://b.com/',
    );
    const entry = await getFormEntry('x');
    expect(entry!.label).toBe('New Label');
  });

  it('dedupes same signature within a single save — one save = one hit', async () => {
    await saveFormEntries(
      [
        mk('email', 'a@x.com', 'text'),
        mk('email', 'b@y.com', 'text'),
      ],
      'https://a.com/',
    );
    const entry = await getFormEntry('email');
    // Second occurrence wins its value; only one candidate created.
    expect(entry!.candidates).toHaveLength(1);
    expect(entry!.candidates[0].value).toBe('b@y.com');
    expect(entry!.candidates[0].hitCount).toBe(1);
  });

  it('skips fields with empty value AND empty displayValue', async () => {
    await saveFormEntries([mk('empty', '', 'text')], 'https://a.com/');
    expect(await getFormEntry('empty')).toBeNull();
  });

  it('keeps fields where only displayValue is set', async () => {
    await saveFormEntries([mk('sel', '', 'select', '汉族')], 'https://a.com/');
    const entry = await getFormEntry('sel');
    expect(entry).not.toBeNull();
    expect(entry!.candidates[0].displayValue).toBe('汉族');
  });
});

describe('form-store · checkbox is single-candidate', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('bumps hitCount on identical checkbox save', async () => {
    await saveFormEntries([mk('news', 'true', 'checkbox')], 'https://a.com/');
    await saveFormEntries([mk('news', 'true', 'checkbox')], 'https://b.com/');
    const entry = await getFormEntry('news');
    expect(entry!.candidates).toHaveLength(1);
    expect(entry!.candidates[0].value).toBe('true');
    expect(entry!.candidates[0].hitCount).toBe(2);
  });

  it('replaces in place when checkbox value flips, resets hitCount to 1', async () => {
    await saveFormEntries([mk('news', 'true', 'checkbox')], 'https://a.com/');
    await saveFormEntries([mk('news', 'false', 'checkbox')], 'https://b.com/');
    const entry = await getFormEntry('news');
    expect(entry!.candidates).toHaveLength(1);
    expect(entry!.candidates[0].value).toBe('false');
    expect(entry!.candidates[0].hitCount).toBe(1);
    expect(entry!.pinnedId).toBeNull();
  });
});

describe('form-store · listing & clearing', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('clearAllFormEntries empties the store', async () => {
    await saveFormEntries(
      [mk('a', '1', 'text'), mk('b', '2', 'text')],
      'https://a.com/',
    );
    await clearAllFormEntries();
    expect(Object.keys(await listFormEntries())).toEqual([]);
  });
});

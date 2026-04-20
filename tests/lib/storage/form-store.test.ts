import { describe, it, expect } from 'vitest';
import {
  saveFormEntries,
  getFormEntry,
  listFormEntries,
  deleteFormEntry,
  clearAllFormEntries,
} from '@/lib/storage/form-store';
import type { CapturedField } from '@/lib/capture/types';

const mk = (sig: string, value: string, kind: CapturedField['kind'], displayValue?: string): CapturedField => ({
  selector: `#${sig}`,
  index: 0,
  kind,
  value,
  displayValue,
  signature: sig,
  label: sig,
});

describe('form-store', () => {
  it('saves and retrieves by signature', async () => {
    await saveFormEntries([mk('gender', '1', 'radio', '男')], 'https://a.com/');
    const a = await getFormEntry('gender');
    expect(a).not.toBeNull();
    expect(a!.value).toBe('1');
    expect(a!.displayValue).toBe('男');
    expect(a!.lastUrl).toBe('https://a.com/');
    expect(a!.hitCount).toBe(1);
  });

  it('increments hitCount on repeat saves', async () => {
    await saveFormEntries([mk('age', '25', 'text')], 'https://a.com/');
    await saveFormEntries([mk('age', '26', 'text')], 'https://b.com/');
    const a = await getFormEntry('age');
    expect(a!.hitCount).toBe(2);
    expect(a!.value).toBe('26');           // latest wins
    expect(a!.lastUrl).toBe('https://b.com/');
  });

  it('skips fields with empty value AND empty displayValue', async () => {
    await saveFormEntries([mk('empty', '', 'text')], 'https://a.com/');
    expect(await getFormEntry('empty')).toBeNull();
  });

  it('keeps fields where only displayValue is set', async () => {
    await saveFormEntries([mk('sel', '', 'select', '汉族')], 'https://a.com/');
    const a = await getFormEntry('sel');
    expect(a).not.toBeNull();
    expect(a!.displayValue).toBe('汉族');
  });

  it('deletes an entry by signature', async () => {
    await saveFormEntries([mk('x', 'v', 'text')], 'https://a.com/');
    await deleteFormEntry('x');
    expect(await getFormEntry('x')).toBeNull();
  });

  it('clearAllFormEntries empties the store', async () => {
    await saveFormEntries(
      [mk('a', '1', 'text'), mk('b', '2', 'text')],
      'https://a.com/',
    );
    await clearAllFormEntries();
    const all = await listFormEntries();
    expect(Object.keys(all)).toEqual([]);
  });

  it('dedupes by signature in a single save — one save = one hit', async () => {
    // A page with three "Email" inputs, all sharing the same signature.
    // Saving once should produce hitCount=1, not hitCount=3.
    await saveFormEntries(
      [
        mk('email', 'a@x.com', 'text'),
        mk('email', 'b@y.com', 'text'),
        mk('email', 'c@z.com', 'text'),
      ],
      'https://a.com/',
    );
    const entry = await getFormEntry('email');
    expect(entry!.hitCount).toBe(1);
    // Last occurrence wins the value.
    expect(entry!.value).toBe('c@z.com');

    // Saving the same page again → hitCount becomes 2, not 5.
    await saveFormEntries(
      [
        mk('email', 'd@w.com', 'text'),
        mk('email', 'e@v.com', 'text'),
      ],
      'https://a.com/',
    );
    const entry2 = await getFormEntry('email');
    expect(entry2!.hitCount).toBe(2);
    expect(entry2!.value).toBe('e@v.com');
  });
});

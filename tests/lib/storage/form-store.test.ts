import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveFormEntries,
  getFormEntry,
  listFormEntries,
  clearAllFormEntries,
  deleteFormEntry,
} from '@/lib/storage/form-store';
import { setFormPin, deleteCandidate } from '@/lib/storage/form-store';
import { addCandidate, updateCandidate } from '@/lib/storage/form-store';
import { bumpCandidateHit } from '@/lib/storage/form-store';
import { WEAK_CANDIDATE_AGE_MS } from '@/lib/capture/constants';
import type { CapturedField } from '@/lib/capture/types';
import { setDomainPref, listFieldDomainPrefs } from '@/lib/storage/domain-prefs-store';

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

describe('form-store · deleteFormEntry', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('removes an entry by signature', async () => {
    await saveFormEntries([mk('x', 'v', 'text')], 'https://a.com/');
    expect(await getFormEntry('x')).not.toBeNull();
    await deleteFormEntry('x');
    expect(await getFormEntry('x')).toBeNull();
  });

  it('is a no-op for an unknown signature', async () => {
    await deleteFormEntry('ghost');
    expect(Object.keys(await listFormEntries())).toEqual([]);
  });
});

describe('form-store · GC', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('does not GC the only remaining candidate no matter how weak', async () => {
    // Seed a weak old candidate by rewriting storage directly.
    await chrome.storage.local.set({
      'formpilot:formEntries': {
        sig1: {
          signature: 'sig1',
          kind: 'text',
          label: 'x',
          pinnedId: null,
          candidates: [{
            id: 'cand-1',
            value: 'old',
            hitCount: 0,
            createdAt: 0,
            updatedAt: 0,
            lastUrl: '(seed)',
          }],
        },
      },
    });
    // Trigger GC by saving an unrelated signature.
    await saveFormEntries([mk('other', 'v', 'text')], 'https://a.com/');
    const entry = await getFormEntry('sig1');
    // Untouched signatures are NOT GC'd. (GC is scoped to touched signatures.)
    expect(entry!.candidates).toHaveLength(1);
  });

  it('GCs weak and stale non-pinned candidates when their signature is touched', async () => {
    const staleTime = Date.now() - WEAK_CANDIDATE_AGE_MS - 1000;
    await chrome.storage.local.set({
      'formpilot:formEntries': {
        email: {
          signature: 'email',
          kind: 'text',
          label: 'Email',
          pinnedId: null,
          candidates: [
            { id: 'strong', value: 'a@x.com', hitCount: 5, createdAt: staleTime, updatedAt: staleTime, lastUrl: '' },
            { id: 'weak-old', value: 'b@y.com', hitCount: 1, createdAt: staleTime, updatedAt: staleTime, lastUrl: '' },
          ],
        },
      },
    });
    // Touch 'email' with a third distinct value so GC runs for this signature.
    await saveFormEntries([mk('email', 'c@z.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    const ids = entry!.candidates.map((c) => c.id).sort();
    expect(ids).not.toContain('weak-old');
    expect(ids).toContain('strong');
  });

  it('spares pinned candidates from GC even if weak and stale', async () => {
    const staleTime = Date.now() - WEAK_CANDIDATE_AGE_MS - 1000;
    await chrome.storage.local.set({
      'formpilot:formEntries': {
        email: {
          signature: 'email',
          kind: 'text',
          label: 'Email',
          pinnedId: 'pinned-weak',
          candidates: [
            { id: 'pinned-weak', value: 'a@x.com', hitCount: 1, createdAt: staleTime, updatedAt: staleTime, lastUrl: '' },
            { id: 'strong', value: 'b@y.com', hitCount: 5, createdAt: staleTime, updatedAt: staleTime, lastUrl: '' },
          ],
        },
      },
    });
    await saveFormEntries([mk('email', 'c@z.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    expect(entry!.candidates.some((c) => c.id === 'pinned-weak')).toBe(true);
  });
});

describe('form-store · pin', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('setFormPin sets and clears pinnedId', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'b@y.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    const target = entry!.candidates.find((c) => c.value === 'b@y.com')!;
    await setFormPin('email', target.id);
    expect((await getFormEntry('email'))!.pinnedId).toBe(target.id);
    await setFormPin('email', null);
    expect((await getFormEntry('email'))!.pinnedId).toBeNull();
  });

  it('setFormPin is a no-op for unknown candidateId', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await setFormPin('email', 'nope');
    expect((await getFormEntry('email'))!.pinnedId).toBeNull();
  });
});

describe('form-store · deleteCandidate', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('removes a candidate', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'b@y.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    const target = entry!.candidates.find((c) => c.value === 'b@y.com')!;
    await deleteCandidate('email', target.id);
    const after = await getFormEntry('email');
    expect(after!.candidates).toHaveLength(1);
    expect(after!.candidates[0].value).toBe('a@x.com');
  });

  it('clears pinnedId when the pinned candidate is deleted', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'b@y.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    const target = entry!.candidates.find((c) => c.value === 'b@y.com')!;
    await setFormPin('email', target.id);
    await deleteCandidate('email', target.id);
    expect((await getFormEntry('email'))!.pinnedId).toBeNull();
  });

  it('deletes the entire entry when the last candidate is removed', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    await deleteCandidate('email', entry!.candidates[0].id);
    expect(await getFormEntry('email')).toBeNull();
  });
});

describe('form-store · manual add / update', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('addCandidate appends a new candidate with hitCount 0', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const id = await addCandidate('email', 'manual@z.com', undefined);
    expect(id).not.toBeNull();
    const entry = await getFormEntry('email');
    const c = entry!.candidates.find((c) => c.id === id)!;
    expect(c.value).toBe('manual@z.com');
    expect(c.hitCount).toBe(0);
    expect(c.lastUrl).toBe('(manual)');
  });

  it('addCandidate is a no-op for unknown signature', async () => {
    const id = await addCandidate('missing', 'x', undefined);
    expect(id).toBeNull();
  });

  it('addCandidate rejects a duplicate (value, displayValue)', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const id = await addCandidate('email', 'a@x.com', undefined);
    expect(id).toBeNull();
    const entry = await getFormEntry('email');
    expect(entry!.candidates).toHaveLength(1);
  });

  it('updateCandidate changes value but keeps the id', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    const oldId = entry!.candidates[0].id;
    await updateCandidate('email', oldId, 'b@y.com', undefined);
    const after = await getFormEntry('email');
    expect(after!.candidates[0].id).toBe(oldId);
    expect(after!.candidates[0].value).toBe('b@y.com');
  });

  it('updateCandidate rejects an edit that duplicates another candidate', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'b@y.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    const bCand = entry!.candidates.find((c) => c.value === 'b@y.com')!;
    // Try to rename 'b@y.com' to 'a@x.com' — should be rejected (no-op).
    await updateCandidate('email', bCand.id, 'a@x.com', undefined);
    const after = await getFormEntry('email');
    // The b candidate still has b's value (unchanged).
    expect(after!.candidates.find((c) => c.id === bCand.id)!.value).toBe('b@y.com');
    expect(after!.candidates).toHaveLength(2);
  });
});

describe('form-store · cascade cleanup on candidate delete', () => {
  beforeEach(async () => {
    await clearAllFormEntries();
    await chrome.storage.local.set({ 'formpilot:fieldDomainPrefs': {} });
  });

  it('removes matching domain prefs when a candidate is deleted', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    await saveFormEntries([mk('email', 'b@y.com', 'text')], 'https://b.com/');
    const entry = await getFormEntry('email');
    const bCand = entry!.candidates.find((c) => c.value === 'b@y.com')!;
    const aCand = entry!.candidates.find((c) => c.value === 'a@x.com')!;
    await setDomainPref('email', 'workday.com', bCand.id);
    await setDomainPref('email', 'lagou.com', aCand.id);

    await deleteCandidate('email', bCand.id);
    const prefs = await listFieldDomainPrefs();
    expect(prefs['email']).toEqual({ 'lagou.com': aCand.id });
  });

  it('removes all domain prefs when the entry is deleted wholesale', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    await setDomainPref('email', 'workday.com', entry!.candidates[0].id);
    await deleteFormEntry('email');
    expect((await listFieldDomainPrefs())['email']).toBeUndefined();
  });

  it('clearAllFormEntries also clears all domain prefs', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    await setDomainPref('email', 'workday.com', entry!.candidates[0].id);
    await clearAllFormEntries();
    expect(await listFieldDomainPrefs()).toEqual({});
  });
});

describe('bumpCandidateHit', () => {
  beforeEach(async () => { await clearAllFormEntries(); });

  it('increments hitCount, updates updatedAt and lastUrl', async () => {
    await saveFormEntries([mk('email', 'a@x.com', 'text')], 'https://a.com/');
    const entry = await getFormEntry('email');
    const id = entry!.candidates[0].id;
    const before = entry!.candidates[0].hitCount;
    await bumpCandidateHit('email', id, 'https://c.com/');
    const after = await getFormEntry('email');
    expect(after!.candidates[0].hitCount).toBe(before + 1);
    expect(after!.candidates[0].lastUrl).toBe('https://c.com/');
  });

  it('is a no-op for unknown signature / candidate', async () => {
    await bumpCandidateHit('missing', 'ghost', 'https://x.com/');
    // No throw; store remains empty.
    expect(Object.keys(await listFormEntries())).toEqual([]);
  });
});

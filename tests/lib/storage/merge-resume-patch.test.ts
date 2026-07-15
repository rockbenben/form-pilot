import { describe, it, expect } from 'vitest';
import { mergeResumePatch } from '@/lib/storage/merge-resume-patch';

// The single deep-merge rule shared by the optimistic render, the debounce
// coalescer, and the storage write. `basic` deep-merges (candidate arrays
// written out-of-band survive a field-edit delta); every other key replaces.

describe('mergeResumePatch', () => {
  it('shallow-replaces distinct top-level keys', () => {
    const base = { basic: { name: 'A' }, education: [{ school: 'MIT' }] };
    const out = mergeResumePatch(base, { work: [{ company: 'G' }] } as any);
    expect(out).toEqual({
      basic: { name: 'A' },
      education: [{ school: 'MIT' }],
      work: [{ company: 'G' }],
    });
  });

  it('deep-merges basic, preserving keys the patch did not touch', () => {
    const base = { basic: { name: 'A', phone: [{ id: 'p1' }] } };
    const out = mergeResumePatch(base, { basic: { name: 'B' } } as any);
    // name updated, phone candidate array preserved (not clobbered).
    expect(out.basic).toEqual({ name: 'B', phone: [{ id: 'p1' }] });
  });

  it('replaces non-basic keys wholesale (arrays are not merged)', () => {
    const base = { education: [{ school: 'MIT' }, { school: 'CMU' }] };
    const out = mergeResumePatch(base, { education: [{ school: 'Stanford' }] } as any);
    expect(out.education).toEqual([{ school: 'Stanford' }]);
  });

  it('uses the patch basic when the base has none', () => {
    const out = mergeResumePatch({ education: [] } as any, { basic: { name: 'A' } } as any);
    expect((out as any).basic).toEqual({ name: 'A' });
  });

  it('keeps the base basic when the patch has none', () => {
    const out = mergeResumePatch({ basic: { name: 'A' } }, { education: [] } as any);
    expect(out.basic).toEqual({ name: 'A' });
  });

  it('does not mutate its inputs', () => {
    const base = { basic: { name: 'A', phone: [{ id: 'p1' }] } };
    const patch = { basic: { name: 'B' } };
    mergeResumePatch(base, patch as any);
    expect(base.basic).toEqual({ name: 'A', phone: [{ id: 'p1' }] });
    expect(patch.basic).toEqual({ name: 'B' });
  });
});

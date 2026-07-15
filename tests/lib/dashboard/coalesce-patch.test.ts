import { describe, it, expect } from 'vitest';
import { coalescePendingPatch } from '@/entrypoints/dashboard/coalesce-patch';

// Regression guard for the dashboard debounced-save data-loss bug:
// editing two different sections within the 500ms window must NOT drop the
// earlier section's patch. The buggy version did `pending = { id, patch }`
// (replace); the fix merges instead.

describe('coalescePendingPatch', () => {
  it('starts a fresh pending patch when nothing is pending', () => {
    expect(coalescePendingPatch(null, 'r1', { basic: { name: 'A' } } as any)).toEqual({
      id: 'r1',
      patch: { basic: { name: 'A' } },
    });
  });

  it('merges patches for the same resume, preserving distinct top-level keys', () => {
    const afterFirst = coalescePendingPatch(null, 'r1', { education: [{ school: 'MIT' }] } as any);
    const afterSecond = coalescePendingPatch(afterFirst, 'r1', { work: [{ company: 'Google' }] } as any);
    // Both edits survive — this is the whole point of the fix.
    expect(afterSecond).toEqual({
      id: 'r1',
      patch: { education: [{ school: 'MIT' }], work: [{ company: 'Google' }] },
    });
  });

  it('deep-merges same-window basic edits (partial scalar deltas), keeping earlier fields', () => {
    // The basic field editor emits partial deltas (candidate arrays are owned by
    // the out-of-band mutation path), so two basic edits in one window must
    // deep-merge — a shallow replace would drop the earlier field's edit.
    const afterFirst = coalescePendingPatch(null, 'r1', { basic: { name: 'A' } } as any);
    const afterSecond = coalescePendingPatch(afterFirst, 'r1', { basic: { gender: 'male' } } as any);
    expect(afterSecond.patch).toEqual({ basic: { name: 'A', gender: 'male' } });
  });

  it('does NOT merge across different resume ids — switching resume starts clean', () => {
    const pendingForR1 = coalescePendingPatch(null, 'r1', { basic: { name: 'A' } } as any);
    const forR2 = coalescePendingPatch(pendingForR1, 'r2', { work: [] } as any);
    expect(forR2).toEqual({ id: 'r2', patch: { work: [] } });
  });

  it('chains three cross-section edits without losing any', () => {
    let p = coalescePendingPatch(null, 'r1', { basic: { name: 'A' } } as any);
    p = coalescePendingPatch(p, 'r1', { skills: { languages: ['ts'] } } as any);
    p = coalescePendingPatch(p, 'r1', { custom: [{ key: 'k', value: 'v' }] } as any);
    expect(Object.keys(p.patch).sort()).toEqual(['basic', 'custom', 'skills']);
  });
});

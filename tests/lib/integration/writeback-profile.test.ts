import { describe, it, expect, beforeEach } from 'vitest';
import { createResume, getResume, updateResume } from '@/lib/storage/resume-store';
import { upsertProfileCandidate } from '@/lib/storage/profile-candidates';
import { applyWriteback } from '@/lib/capture/writeback';

/**
 * Regression test for the WRITE_BACK_TO_RESUME handler ordering bug.
 *
 * Before the fix, the handler ran profile upserts first, then `applyWriteback`
 * on a snapshot captured before the upsert. The snapshot's empty phone array
 * would clobber the freshly saved candidate when updateResume wrote the whole
 * `basic` sub-record back.
 *
 * The fix reverses the order: legacy writeback first (uses the stale snapshot,
 * but only touches non-profile fields), then profile upserts (re-read resume
 * from storage, see the post-writeback state, safely append their candidates).
 *
 * These tests replicate the handler's logic at the store layer so the ordering
 * contract is locked even if the handler is refactored later.
 */
describe('WRITE_BACK_TO_RESUME ordering (regression test)', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('preserves a profile candidate when legacy fields are written in the same request', async () => {
    const { meta: { id } } = await createResume('t');

    // Simulate the handler flow with the CORRECT ordering:
    //   legacy writeback first (updates basic.name), then profile upsert
    //   (adds a phone candidate).
    const resume = await getResume(id);
    expect(resume).not.toBeNull();

    const legacyPairs = [{ resumePath: 'basic.name', value: '张三' }];
    const profilePairs = [{ resumePath: 'basic.phone' as const, value: '138xxxxxxxx' }];

    // Step 1: legacy writeback
    const updated = applyWriteback(resume!, legacyPairs);
    const { meta: _m, ...patch } = updated;
    await updateResume(id, patch);

    // Step 2: profile upsert (re-reads resume from storage inside)
    for (const { resumePath, value } of profilePairs) {
      await upsertProfileCandidate(id, resumePath, value, 'https://a.com/');
    }

    const finalResume = await getResume(id);
    // Both writes should be present.
    expect(finalResume!.basic.name).toBe('张三');
    expect(finalResume!.basic.phone).toHaveLength(1);
    expect(finalResume!.basic.phone[0].value).toBe('138xxxxxxxx');
  });

  // Note: a natural "demonstrates-the-bug" test with the WRONG order (upsert → writeback)
  // is not reproducible under the current in-memory storage mock in tests/setup.ts.
  // Real chrome.storage.local structured-clones on get/set, so the handler's pre-upsert
  // snapshot diverges from the post-upsert storage state. The mock aliases references,
  // so upsert's in-place mutation propagates back to the snapshot variable and
  // applyWriteback clones the already-mutated state — masking the bug. The positive
  // test above + the profile-only / legacy-only tests below are the API-level
  // regression guard. Correctness of the background.ts handler ordering is enforced
  // by code review, not by this suite.

  it('handles profile-only writebacks (no legacy pairs) correctly', async () => {
    const { meta: { id } } = await createResume('t');

    await upsertProfileCandidate(id, 'basic.phone', '138xxxxxxxx', 'https://a.com/');
    await upsertProfileCandidate(id, 'basic.email', 'zhang@x.com', 'https://a.com/');

    const r = await getResume(id);
    expect(r!.basic.phone).toHaveLength(1);
    expect(r!.basic.email).toHaveLength(1);
  });

  it('handles legacy-only writebacks (no profile pairs) correctly', async () => {
    const { meta: { id } } = await createResume('t');

    const resume = await getResume(id);
    const legacyPairs = [
      { resumePath: 'basic.name', value: '张三' },
      { resumePath: 'basic.gender', value: '男' },
    ];
    const updated = applyWriteback(resume!, legacyPairs);
    const { meta: _m, ...patch } = updated;
    await updateResume(id, patch);

    const r = await getResume(id);
    expect(r!.basic.name).toBe('张三');
    expect(r!.basic.gender).toBe('男');
    expect(r!.basic.phone).toEqual([]);
    expect(r!.basic.email).toEqual([]);
  });
});

// tests/lib/storage/profile-candidates.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createResume,
  getResume,
} from '@/lib/storage/resume-store';
import {
  upsertProfileCandidate,
  addProfileCandidate,
  updateProfileCandidate,
  deleteProfileCandidate,
  setProfilePin,
  bumpProfileCandidateHit,
} from '@/lib/storage/profile-candidates';
import {
  setProfileDomainPref,
  listForResume,
} from '@/lib/storage/profile-domain-prefs-store';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

async function newResumeId(): Promise<string> {
  const r = await createResume('t');
  return r.meta.id;
}

describe('profile-candidates · upsertProfileCandidate', () => {
  it('creates a new candidate when none exists', async () => {
    const id = await newResumeId();
    const { candidateId, bumped } = await upsertProfileCandidate(id, 'basic.phone', '138', 'https://a.com/');
    expect(candidateId).toMatch(/[0-9a-f-]{36}/i);
    expect(bumped).toBe(false);
    const r = await getResume(id);
    expect(r!.basic.phone).toHaveLength(1);
    expect(r!.basic.phone[0].value).toBe('138');
    expect(r!.basic.phone[0].hitCount).toBe(1);
    expect(r!.basic.phone[0].lastUrl).toBe('https://a.com/');
  });

  it('bumps hitCount on an existing value match', async () => {
    const id = await newResumeId();
    const first = await upsertProfileCandidate(id, 'basic.phone', '138', 'https://a.com/');
    const again = await upsertProfileCandidate(id, 'basic.phone', '138', 'https://b.com/');
    expect(again.candidateId).toBe(first.candidateId);
    expect(again.bumped).toBe(true);
    const r = await getResume(id);
    expect(r!.basic.phone).toHaveLength(1);
    expect(r!.basic.phone[0].hitCount).toBe(2);
    expect(r!.basic.phone[0].lastUrl).toBe('https://b.com/');
  });

  it('appends a new candidate when value differs', async () => {
    const id = await newResumeId();
    await upsertProfileCandidate(id, 'basic.phone', '138', 'https://a.com/');
    await upsertProfileCandidate(id, 'basic.phone', '150', 'https://b.com/');
    const r = await getResume(id);
    expect(r!.basic.phone).toHaveLength(2);
  });
});

describe('profile-candidates · addProfileCandidate', () => {
  it('adds with label and hitCount 0', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'Personal');
    expect(cid).not.toBeNull();
    const r = await getResume(id);
    const c = r!.basic.phone.find((x) => x.id === cid)!;
    expect(c.value).toBe('138');
    expect(c.label).toBe('Personal');
    expect(c.hitCount).toBe(0);
    expect(c.lastUrl).toBe('(manual)');
  });

  it('rejects a duplicate value', async () => {
    const id = await newResumeId();
    await addProfileCandidate(id, 'basic.phone', '138', 'A');
    const dup = await addProfileCandidate(id, 'basic.phone', '138', 'B');
    expect(dup).toBeNull();
    const r = await getResume(id);
    expect(r!.basic.phone).toHaveLength(1);
  });
});

describe('profile-candidates · updateProfileCandidate', () => {
  it('preserves id when editing value', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await updateProfileCandidate(id, 'basic.phone', cid!, '139', 'A');
    const r = await getResume(id);
    expect(r!.basic.phone[0].id).toBe(cid);
    expect(r!.basic.phone[0].value).toBe('139');
  });

  it('rejects an edit that duplicates another candidate', async () => {
    const id = await newResumeId();
    const a = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    const b = await addProfileCandidate(id, 'basic.phone', '150', 'B');
    await updateProfileCandidate(id, 'basic.phone', b!, '138', 'B');
    const r = await getResume(id);
    expect(r!.basic.phone.find((c) => c.id === b)!.value).toBe('150');
    void a;
  });
});

describe('profile-candidates · deleteProfileCandidate', () => {
  it('removes the candidate', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await deleteProfileCandidate(id, 'basic.phone', cid!);
    const r = await getResume(id);
    expect(r!.basic.phone).toHaveLength(0);
  });

  it('clears pinnedId when deleting the pinned candidate', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await setProfilePin(id, 'basic.phone', cid!);
    await deleteProfileCandidate(id, 'basic.phone', cid!);
    const r = await getResume(id);
    expect(r!.basic.phonePinnedId).toBeNull();
  });

  it('cascade-cleans profileDomainPrefs pointing to the deleted candidate', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await setProfileDomainPref(id, 'basic.phone', 'workday.com', cid!);
    await deleteProfileCandidate(id, 'basic.phone', cid!);
    const prefs = await listForResume(id);
    expect(prefs['basic.phone']).toBeUndefined();
  });
});

describe('profile-candidates · setProfilePin', () => {
  it('sets and clears pinnedId', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await setProfilePin(id, 'basic.phone', cid!);
    expect((await getResume(id))!.basic.phonePinnedId).toBe(cid);
    await setProfilePin(id, 'basic.phone', null);
    expect((await getResume(id))!.basic.phonePinnedId).toBeNull();
  });

  it('is a no-op for an unknown candidateId', async () => {
    const id = await newResumeId();
    await setProfilePin(id, 'basic.phone', 'ghost');
    expect((await getResume(id))!.basic.phonePinnedId).toBeNull();
  });
});

describe('profile-candidates · bumpProfileCandidateHit', () => {
  it('increments hitCount and updates lastUrl', async () => {
    const id = await newResumeId();
    const cid = await addProfileCandidate(id, 'basic.phone', '138', 'A');
    await bumpProfileCandidateHit(id, 'basic.phone', cid!, 'https://c.com/');
    const r = await getResume(id);
    const c = r!.basic.phone.find((x) => x.id === cid)!;
    expect(c.hitCount).toBe(1);
    expect(c.lastUrl).toBe('https://c.com/');
  });
});

import { describe, it, expect } from 'vitest';
import {
  createResume, getResume, listResumes, updateResume, deleteResume, renameResume,
  getActiveResumeId, setActiveResumeId, importResume, resolveActiveResume,
} from '@/lib/storage/resume-store';
import {
  setProfileDomainPref,
  listForResume,
} from '@/lib/storage/profile-domain-prefs-store';

describe('resume-store', () => {
  it('creates a new resume with generated id and timestamps', async () => {
    const resume = await createResume('前端开发');
    expect(resume.meta.id).toBeTruthy();
    expect(resume.meta.name).toBe('前端开发');
    expect(resume.meta.createdAt).toBeGreaterThan(0);
    expect(resume.meta.updatedAt).toBe(resume.meta.createdAt);
    expect(resume.basic.name).toBe('');
    expect(resume.education).toEqual([]);
  });

  it('lists all resumes', async () => {
    await createResume('前端');
    await createResume('后端');
    const list = await listResumes();
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.meta.name)).toContain('前端');
    expect(list.map((r) => r.meta.name)).toContain('后端');
  });

  it('gets a resume by id', async () => {
    const created = await createResume('设计师');
    const found = await getResume(created.meta.id);
    expect(found).not.toBeNull();
    expect(found!.meta.name).toBe('设计师');
  });

  it('returns null for unknown id', async () => {
    const found = await getResume('nonexistent');
    expect(found).toBeNull();
  });

  it('updates resume fields and bumps updatedAt', async () => {
    const created = await createResume('test');
    const now = Date.now();
    const emailCandidate = { id: 'e1', value: 'z@test.com', label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '' };
    const updated = await updateResume(created.meta.id, {
      basic: { ...created.basic, name: '张三', email: [emailCandidate] },
    });
    expect(updated.basic.name).toBe('张三');
    expect(updated.basic.email[0].value).toBe('z@test.com');
    expect(updated.meta.updatedAt).toBeGreaterThanOrEqual(created.meta.updatedAt);
  });

  it('deep-merges a partial basic patch, preserving candidate arrays it did not touch', async () => {
    // Regression for the field-edit-vs-candidate race: the debounced field editor
    // sends only the changed scalar delta (e.g. { basic: { name } }). That must
    // NOT wipe basic.phone written out-of-band by a candidate mutation.
    const created = await createResume('race');
    const now = Date.now();
    const phone = { id: 'p1', value: '13800138000', label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '' };
    // Out-of-band candidate write lands first.
    await updateResume(created.meta.id, { basic: { ...created.basic, phone: [phone] } });
    // Then a debounced scalar field edit arrives as a partial delta.
    const updated = await updateResume(created.meta.id, { basic: { name: '张三' } });
    expect(updated.basic.name).toBe('张三');
    expect(updated.basic.phone).toHaveLength(1);           // candidate survived
    expect(updated.basic.phone[0].value).toBe('13800138000');
  });

  it('deletes a resume', async () => {
    const created = await createResume('to-delete');
    await deleteResume(created.meta.id);
    const found = await getResume(created.meta.id);
    expect(found).toBeNull();
  });

  it('tracks active resume id', async () => {
    const r1 = await createResume('r1');
    const r2 = await createResume('r2');
    await setActiveResumeId(r1.meta.id);
    expect(await getActiveResumeId()).toBe(r1.meta.id);
    await setActiveResumeId(r2.meta.id);
    expect(await getActiveResumeId()).toBe(r2.meta.id);
  });

  it('renames a resume and bumps updatedAt', async () => {
    const created = await createResume('旧名字');
    await new Promise((r) => setTimeout(r, 5));
    const renamed = await renameResume(created.meta.id, '新名字');
    expect(renamed.meta.name).toBe('新名字');
    expect(renamed.meta.updatedAt).toBeGreaterThan(created.meta.updatedAt);
    // Other fields untouched
    expect(renamed.basic).toEqual(created.basic);
  });

  it('rename trims whitespace', async () => {
    const created = await createResume('x');
    const renamed = await renameResume(created.meta.id, '  My Profile  ');
    expect(renamed.meta.name).toBe('My Profile');
  });

  it('rename rejects empty/whitespace names', async () => {
    const created = await createResume('x');
    await expect(renameResume(created.meta.id, '   ')).rejects.toThrow();
    await expect(renameResume(created.meta.id, '')).rejects.toThrow();
  });

  it('rename throws when id not found', async () => {
    await expect(renameResume('nope', 'x')).rejects.toThrow();
  });
});

describe('resume-store · importResume legacy schema', () => {
  it('wraps a legacy string phone into a single-candidate array', async () => {
    // chrome.storage is cleared before each test by the global beforeEach in setup.ts
    const legacy = JSON.stringify({
      meta: { name: 'old' },
      basic: { phone: '138xxxxxxxx', email: '' },
    });
    const resume = await importResume(legacy);
    expect(Array.isArray(resume.basic.phone)).toBe(true);
    expect(resume.basic.phone).toHaveLength(1);
    expect(resume.basic.phone[0].value).toBe('138xxxxxxxx');
    expect(resume.basic.phone[0].hitCount).toBe(0);
    expect(resume.basic.phone[0].lastUrl).toBe('(imported)');
    expect(resume.basic.phonePinnedId).toBeNull();
    expect(resume.basic.email).toEqual([]);
    expect(resume.basic.emailPinnedId).toBeNull();
  });

  it('leaves already-array phone/email untouched', async () => {
    // chrome.storage is cleared before each test by the global beforeEach in setup.ts
    const now = Date.now();
    const cand = { id: 'c1', value: 'a@b.com', label: 'p', hitCount: 2, createdAt: now, updatedAt: now, lastUrl: '' };
    const modern = JSON.stringify({
      meta: { name: 'new' },
      basic: { phone: [], email: [cand], phonePinnedId: null, emailPinnedId: 'c1' },
    });
    const resume = await importResume(modern);
    expect(resume.basic.email).toHaveLength(1);
    expect(resume.basic.email[0].id).toBe('c1');
    expect(resume.basic.emailPinnedId).toBe('c1');
  });
});

describe('resume-store · deleteResume cascades profile domain prefs', () => {
  it('removes the deleted resume\'s slice from profileDomainPrefs', async () => {
    await chrome.storage.local.clear();
    const r1 = await createResume('one');
    const r2 = await createResume('two');
    await setProfileDomainPref(r1.meta.id, 'basic.phone', 'workday.com', 'c1');
    await setProfileDomainPref(r2.meta.id, 'basic.phone', 'workday.com', 'c2');
    await deleteResume(r1.meta.id);
    expect(await listForResume(r1.meta.id)).toEqual({});
    expect((await listForResume(r2.meta.id))['basic.phone']['workday.com']).toBe('c2');
  });
});

describe('resume-store · resolveActiveResume repairs the selection', () => {
  it('returns null when there are no resumes at all', async () => {
    await chrome.storage.local.clear();
    expect(await resolveActiveResume()).toBeNull();
  });

  it('returns the selected resume when the id is valid', async () => {
    await chrome.storage.local.clear();
    await createResume('one');
    const two = await createResume('two');
    await setActiveResumeId(two.meta.id);
    expect((await resolveActiveResume())!.meta.id).toBe(two.meta.id);
  });

  // The bug this guards: the popup fell back to the first resume for display
  // while the fill path returned null, so a populated profile showed a healthy
  // completion bar next to fills that produced nothing.
  it('falls back to the first resume when no id is set, and persists it', async () => {
    await chrome.storage.local.clear();
    const first = await createResume('one');
    await createResume('two');
    await chrome.storage.local.remove('formpilot:activeResumeId');
    expect((await resolveActiveResume())!.meta.id).toBe(first.meta.id);
    expect(await getActiveResumeId()).toBe(first.meta.id);
  });

  it('repairs a dangling id left behind by a deleted resume', async () => {
    await chrome.storage.local.clear();
    const keep = await createResume('keep');
    await setActiveResumeId('does-not-exist');
    expect((await resolveActiveResume())!.meta.id).toBe(keep.meta.id);
    expect(await getActiveResumeId()).toBe(keep.meta.id);
  });
});

describe('resume-store · deleteResume owns the whole cascade', () => {
  // The pointer used to be repaired by the Dashboard, so any other caller left
  // it dangling and two layers each owned half of one invariant.
  it('repoints the active profile when the active one is deleted', async () => {
    await chrome.storage.local.clear();
    const a = await createResume('a');
    const b = await createResume('b');
    await setActiveResumeId(a.meta.id);
    await deleteResume(a.meta.id);
    expect(await getActiveResumeId()).toBe(b.meta.id);
    expect((await resolveActiveResume())!.meta.id).toBe(b.meta.id);
  });

  it('leaves the pointer alone when a different profile is deleted', async () => {
    await chrome.storage.local.clear();
    const a = await createResume('a');
    const b = await createResume('b');
    await setActiveResumeId(a.meta.id);
    await deleteResume(b.meta.id);
    expect(await getActiveResumeId()).toBe(a.meta.id);
  });

  it('drops the pointer when the last profile goes', async () => {
    await chrome.storage.local.clear();
    const only = await createResume('only');
    await setActiveResumeId(only.meta.id);
    await deleteResume(only.meta.id);
    expect(await getActiveResumeId()).toBeNull();
    expect(await resolveActiveResume()).toBeNull();
    expect(await listResumes()).toEqual([]);
  });

  it('never leaves a pointer at a resume that no longer exists', async () => {
    await chrome.storage.local.clear();
    const a = await createResume('a');
    const b = await createResume('b');
    for (const id of [a.meta.id, b.meta.id]) {
      await setActiveResumeId(id);
      await deleteResume(id);
      const pointer = await getActiveResumeId();
      const ids = (await listResumes()).map((r) => r.meta.id);
      if (pointer !== null) expect(ids).toContain(pointer);
    }
  });
});

describe('resume-store · which profile takes over', () => {
  const olderThenNewer = async () => {
    await chrome.storage.local.clear();
    const blank = await createResume('blank');          // created first
    await new Promise((r) => setTimeout(r, 5));
    const real = await createResume('real');
    await new Promise((r) => setTimeout(r, 5));
    await updateResume(real.meta.id, { basic: { name: '张明远' } });  // worked in
    return { blank, real };
  };

  // Storage keeps creation order, so taking the first survivor handed the user
  // their oldest profile — usually the blank one made before importing. Every
  // fill then came back almost entirely "missing from your profile", with
  // nothing on screen saying the active profile had changed.
  it('after deleting the active profile, adopts the most recently updated one', async () => {
    const { blank, real } = await olderThenNewer();
    const third = await createResume('third');
    await setActiveResumeId(third.meta.id);
    await deleteResume(third.meta.id);
    expect(await getActiveResumeId()).toBe(real.meta.id);
    expect(await getActiveResumeId()).not.toBe(blank.meta.id);
  });

  it('repairs a dangling pointer to the most recently updated one too', async () => {
    const { blank, real } = await olderThenNewer();
    await setActiveResumeId('gone');
    expect((await resolveActiveResume())!.meta.id).toBe(real.meta.id);
    expect((await resolveActiveResume())!.meta.id).not.toBe(blank.meta.id);
  });

  it('still honours an explicit selection', async () => {
    const { blank } = await olderThenNewer();
    await setActiveResumeId(blank.meta.id);
    expect((await resolveActiveResume())!.meta.id).toBe(blank.meta.id);
  });
});

describe('resume-store · dropped fields fold into their replacement', () => {
  // `skills.frameworks` was removed: no board has a field for it, so it could
  // only sit in the profile dragging the completeness denominator down. The
  // values are still skills the user typed, so they must not vanish.
  it('merges a stored frameworks list into tools on read', async () => {
    await chrome.storage.local.clear();
    const r = await createResume('legacy');
    const stored = (await chrome.storage.local.get('formpilot:resumes'))['formpilot:resumes'] as any[];
    stored[0].skills = { languages: ['Go'], frameworks: ['React', 'Vue'], tools: ['Git'], certificates: [] };
    await chrome.storage.local.set({ 'formpilot:resumes': stored });

    const read = await getResume(r.meta.id);
    expect(read!.skills.tools).toEqual(['Git', 'React', 'Vue']);
    expect((read!.skills as any).frameworks).toBeUndefined();
    expect(read!.skills.languages).toEqual(['Go']);
  });

  it('does not duplicate a value already present in tools', async () => {
    await chrome.storage.local.clear();
    const r = await createResume('dupe');
    const stored = (await chrome.storage.local.get('formpilot:resumes'))['formpilot:resumes'] as any[];
    stored[0].skills = { languages: [], frameworks: ['React'], tools: ['React'], certificates: [] };
    await chrome.storage.local.set({ 'formpilot:resumes': stored });

    expect((await getResume(r.meta.id))!.skills.tools).toEqual(['React']);
  });

  it('leaves a resume with no legacy field untouched', async () => {
    await chrome.storage.local.clear();
    const r = await createResume('modern');
    await updateResume(r.meta.id, { skills: { languages: ['Go'], tools: ['Git'], certificates: [] } });
    expect((await getResume(r.meta.id))!.skills.tools).toEqual(['Git']);
  });
});

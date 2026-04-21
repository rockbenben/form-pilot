// tests/lib/storage/profile-domain-prefs-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  listForResume,
  setProfileDomainPref,
  clearProfileDomainPref,
  clearProfileDomainPrefsForPath,
  clearProfileDomainPrefsForResume,
  clearPrefsPointingToProfileCandidate,
  type ProfileCandidatePath,
} from '@/lib/storage/profile-domain-prefs-store';

const PATH: ProfileCandidatePath = 'basic.phone';

describe('profile-domain-prefs-store', () => {
  beforeEach(async () => {
    await chrome.storage.local.set({ 'formpilot:profileDomainPrefs': {} });
  });

  it('lists empty for an unknown resume', async () => {
    expect(await listForResume('r1')).toEqual({});
  });

  it('sets and reads a pref scoped to resume+path+domain', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    const prefs = await listForResume('r1');
    expect(prefs[PATH]['workday.com']).toBe('c1');
  });

  it('overwrites a pref on the same (resume, path, domain)', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c2');
    const prefs = await listForResume('r1');
    expect(prefs[PATH]['workday.com']).toBe('c2');
  });

  it('isolates per-resume prefs', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    await setProfileDomainPref('r2', PATH, 'workday.com', 'c9');
    expect((await listForResume('r1'))[PATH]['workday.com']).toBe('c1');
    expect((await listForResume('r2'))[PATH]['workday.com']).toBe('c9');
  });

  it('clearProfileDomainPref removes and prunes empty parents', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    await clearProfileDomainPref('r1', PATH, 'workday.com');
    expect(await listForResume('r1')).toEqual({});
  });

  it('clearProfileDomainPrefsForPath removes every domain for that path', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    await setProfileDomainPref('r1', PATH, 'lagou.com', 'c2');
    await setProfileDomainPref('r1', 'basic.email', 'workday.com', 'e1');
    await clearProfileDomainPrefsForPath('r1', PATH);
    const prefs = await listForResume('r1');
    expect(prefs[PATH]).toBeUndefined();
    expect(prefs['basic.email']).toEqual({ 'workday.com': 'e1' });
  });

  it('clearProfileDomainPrefsForResume removes the whole resume slice', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'c1');
    await setProfileDomainPref('r2', PATH, 'workday.com', 'c9');
    await clearProfileDomainPrefsForResume('r1');
    expect(await listForResume('r1')).toEqual({});
    expect((await listForResume('r2'))[PATH]['workday.com']).toBe('c9');
  });

  it('clearPrefsPointingToProfileCandidate removes all matching domains', async () => {
    await setProfileDomainPref('r1', PATH, 'workday.com', 'stale');
    await setProfileDomainPref('r1', PATH, 'greenhouse.io', 'stale');
    await setProfileDomainPref('r1', PATH, 'lagou.com', 'keep');
    await clearPrefsPointingToProfileCandidate('r1', PATH, 'stale');
    const prefs = await listForResume('r1');
    expect(prefs[PATH]).toEqual({ 'lagou.com': 'keep' });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  listFieldDomainPrefs,
  setDomainPref,
  clearDomainPref,
  clearDomainPrefsForSignature,
  clearPrefsPointingToCandidate,
  normalizeDomain,
} from '@/lib/storage/domain-prefs-store';

describe('domain-prefs-store', () => {
  beforeEach(async () => {
    await chrome.storage.local.set({ 'formpilot:fieldDomainPrefs': {} });
  });

  it('sets and reads a pref', async () => {
    await setDomainPref('email', 'workday.com', 'cand-1');
    const all = await listFieldDomainPrefs();
    expect(all['email']['workday.com']).toBe('cand-1');
  });

  it('overwrites a pref on the same (signature, domain)', async () => {
    await setDomainPref('email', 'workday.com', 'cand-1');
    await setDomainPref('email', 'workday.com', 'cand-2');
    const all = await listFieldDomainPrefs();
    expect(all['email']['workday.com']).toBe('cand-2');
  });

  it('clearDomainPref removes one (signature, domain) and prunes empty signature maps', async () => {
    await setDomainPref('email', 'workday.com', 'cand-1');
    await clearDomainPref('email', 'workday.com');
    const all = await listFieldDomainPrefs();
    expect(all['email']).toBeUndefined();
  });

  it('clearDomainPrefsForSignature removes every domain for a signature', async () => {
    await setDomainPref('email', 'workday.com', 'c1');
    await setDomainPref('email', 'lagou.com', 'c2');
    await clearDomainPrefsForSignature('email');
    expect((await listFieldDomainPrefs())['email']).toBeUndefined();
  });

  it('clearPrefsPointingToCandidate removes only matching domain entries', async () => {
    await setDomainPref('email', 'workday.com', 'stale');
    await setDomainPref('email', 'lagou.com', 'keep');
    await clearPrefsPointingToCandidate('email', 'stale');
    const all = await listFieldDomainPrefs();
    expect(all['email']).toEqual({ 'lagou.com': 'keep' });
  });

  it('clearPrefsPointingToCandidate removes all domains pointing to deleted id', async () => {
    await setDomainPref('email', 'workday.com', 'stale');
    await setDomainPref('email', 'greenhouse.io', 'stale');
    await setDomainPref('email', 'lagou.com', 'keep');
    await clearPrefsPointingToCandidate('email', 'stale');
    const all = await listFieldDomainPrefs();
    expect(all['email']).toEqual({ 'lagou.com': 'keep' });
  });

  it('normalizeDomain strips www. prefix', () => {
    expect(normalizeDomain('www.example.com')).toBe('example.com');
    expect(normalizeDomain('example.com')).toBe('example.com');
    expect(normalizeDomain('sub.example.com')).toBe('sub.example.com');
  });
});

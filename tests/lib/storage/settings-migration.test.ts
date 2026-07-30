import { describe, it, expect } from 'vitest';
import { getSettings, updateSettings } from '@/lib/storage/settings-store';
import type { Settings } from '@/lib/storage/types';

// Frozen snapshot of the domain whitelist FormPilot used to ship before the
// resume-field probe replaced it. Deliberately NOT imported from production
// code — this is a separate copy so a wrong edit to the production constant
// doesn't silently pass this migration's regression tests.
const LEGACY_DEFAULT_DOMAINS = [
  'mokahr.com', 'moka.com', 'zhaopin.com', 'liepin.com', 'zhipin.com',
  'lagou.com', 'nowcoder.com',
  'myworkday.com', 'myworkdayjobs.com', 'greenhouse.io', 'lever.co',
  'icims.com', 'taleo.net', 'smartrecruiters.com',
  'hotjob.cn', 'beisen.com', 'feishu.cn',
];

const KEY = 'formpilot:settings';

async function seed(value: Record<string, unknown>) {
  await chrome.storage.local.set({ [KEY]: value });
}

async function raw(): Promise<Record<string, unknown>> {
  const r = await chrome.storage.local.get(KEY);
  return (r[KEY] ?? {}) as Record<string, unknown>;
}

describe('settings migration', () => {
  it('defaults to auto mode with no overrides on a fresh install', async () => {
    const s = await getSettings();
    expect(s.triggerMode).toBe('auto');
    expect(s.siteOverrides).toEqual({});
  });

  it('promotes user-added domains to always overrides', async () => {
    await seed({ allowedDomains: [...LEGACY_DEFAULT_DOMAINS, 'my-company.cn'] });
    const s = await getSettings();
    expect(s.siteOverrides['my-company.cn']).toBe('always');
  });

  it('discards the shipped default domains', async () => {
    await seed({ allowedDomains: [...LEGACY_DEFAULT_DOMAINS] });
    const s = await getSettings();
    expect(s.siteOverrides).toEqual({});
  });

  it('drops the legacy key after migrating', async () => {
    await seed({ allowedDomains: ['my-company.cn'] });
    await getSettings();
    expect('allowedDomains' in (await raw())).toBe(false);
  });

  it('is idempotent', async () => {
    await seed({ allowedDomains: ['my-company.cn'] });
    await getSettings();
    const after = await raw();
    await getSettings();
    expect(await raw()).toEqual(after);
  });

  it('does not overwrite an existing override', async () => {
    await seed({
      allowedDomains: ['my-company.cn'],
      siteOverrides: { 'my-company.cn': 'never' },
    });
    const s = await getSettings();
    expect(s.siteOverrides['my-company.cn']).toBe('never');
  });

  it('leaves already-migrated settings untouched', async () => {
    await seed({ triggerMode: 'manual', siteOverrides: { 'a.com': 'never' } });
    const s = await getSettings();
    expect(s.triggerMode).toBe('manual');
    expect(s.siteOverrides).toEqual({ 'a.com': 'never' });
  });

  it('hands back a fresh siteOverrides object each call', async () => {
    await seed({ siteOverrides: { 'a.com': 'never' } });
    const a = await getSettings();
    a.siteOverrides['b.com'] = 'always';
    const b = await getSettings();
    expect(b.siteOverrides).toEqual({ 'a.com': 'never' });
  });

  it('re-migrates a legacy allowedDomains reintroduced via updateSettings', async () => {
    await seed({ triggerMode: 'auto', siteOverrides: {} });
    // Simulates a legacy caller passing the pre-migration shape, which the
    // `Settings` type no longer declares.
    await updateSettings({
      allowedDomains: ['fresh-domain.cn'],
    } as Partial<Settings> & { allowedDomains?: string[] });
    const stored = await raw();
    expect('allowedDomains' in stored).toBe(false);
    expect((stored.siteOverrides as Record<string, string>)['fresh-domain.cn']).toBe('always');
  });
});

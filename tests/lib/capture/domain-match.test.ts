import { describe, it, expect } from 'vitest';
import {
  matchesAllowedDomain,
  resolveSiteOverride,
  resolveSiteOverrideKey,
  safeHostname,
} from '@/lib/capture/domain-match';

describe('matchesAllowedDomain', () => {
  it('matches exact hostname', () => {
    expect(matchesAllowedDomain('mokahr.com', ['mokahr.com'])).toBe(true);
  });

  it('matches subdomains via suffix', () => {
    expect(matchesAllowedDomain('jobs.mokahr.com', ['mokahr.com'])).toBe(true);
    expect(matchesAllowedDomain('a.b.mokahr.com', ['mokahr.com'])).toBe(true);
  });

  it('does not match prefix-only collisions', () => {
    expect(matchesAllowedDomain('faux-mokahr.com', ['mokahr.com'])).toBe(false);
    expect(matchesAllowedDomain('mokahr.company.com', ['mokahr.com'])).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesAllowedDomain('JOBS.MOKAHR.COM', ['mokahr.com'])).toBe(true);
    expect(matchesAllowedDomain('jobs.mokahr.com', ['MOKAHR.COM'])).toBe(true);
  });

  it('strips leading dots and whitespace from entries', () => {
    expect(matchesAllowedDomain('mokahr.com', ['  .mokahr.com  '])).toBe(true);
  });

  it('returns false for empty or missing input', () => {
    expect(matchesAllowedDomain('', ['mokahr.com'])).toBe(false);
    expect(matchesAllowedDomain('mokahr.com', [])).toBe(false);
    expect(matchesAllowedDomain('mokahr.com', ['   '])).toBe(false);
  });
});

describe('safeHostname', () => {
  it('parses a valid URL', () => {
    expect(safeHostname('https://jobs.mokahr.com/apply?id=1')).toBe('jobs.mokahr.com');
  });

  it('returns empty string on malformed input', () => {
    expect(safeHostname('not a url')).toBe('');
  });
});

describe('resolveSiteOverride', () => {
  it('matches an exact hostname', () => {
    expect(resolveSiteOverride('mokahr.com', { 'mokahr.com': 'never' })).toBe('never');
  });

  it('matches subdomains via suffix', () => {
    expect(resolveSiteOverride('jobs.mokahr.com', { 'mokahr.com': 'always' })).toBe('always');
  });

  it('does not match prefix-only collisions', () => {
    expect(resolveSiteOverride('faux-mokahr.com', { 'mokahr.com': 'never' })).toBeUndefined();
  });

  it('prefers the longest matching key', () => {
    const overrides = { 'example.com': 'never', 'jobs.example.com': 'always' } as const;
    expect(resolveSiteOverride('jobs.example.com', { ...overrides })).toBe('always');
    expect(resolveSiteOverride('www.example.com', { ...overrides })).toBe('never');
  });

  it('is case-insensitive and tolerates leading dots', () => {
    expect(resolveSiteOverride('JOBS.MOKAHR.COM', { '  .MokaHR.com ': 'never' })).toBe('never');
  });

  it('returns undefined for no match or empty input', () => {
    expect(resolveSiteOverride('mokahr.com', {})).toBeUndefined();
    expect(resolveSiteOverride('', { 'mokahr.com': 'never' })).toBeUndefined();
  });
});

describe('resolveSiteOverrideKey', () => {
  it('returns the stored key, in its original form, for an exact match', () => {
    expect(resolveSiteOverrideKey('mokahr.com', { '  .MokaHR.com ': 'never' })).toBe(
      '  .MokaHR.com ',
    );
  });

  it('returns the parent key when only the parent matches a subdomain', () => {
    expect(resolveSiteOverrideKey('jobs.example.com', { 'example.com': 'always' })).toBe(
      'example.com',
    );
  });

  it('returns the longest matching key when both a parent and a child rule exist', () => {
    const overrides = { 'example.com': 'always', 'jobs.example.com': 'never' } as const;
    expect(resolveSiteOverrideKey('jobs.example.com', { ...overrides })).toBe('jobs.example.com');
    expect(resolveSiteOverrideKey('www.example.com', { ...overrides })).toBe('example.com');
  });

  it('returns undefined for no match and for an empty hostname', () => {
    expect(resolveSiteOverrideKey('mokahr.com', {})).toBeUndefined();
    expect(resolveSiteOverrideKey('faux-mokahr.com', { 'mokahr.com': 'never' })).toBeUndefined();
    expect(resolveSiteOverrideKey('', { 'mokahr.com': 'never' })).toBeUndefined();
  });
});

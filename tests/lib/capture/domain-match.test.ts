import { describe, it, expect } from 'vitest';
import { matchesAllowedDomain, safeHostname } from '@/lib/capture/domain-match';

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

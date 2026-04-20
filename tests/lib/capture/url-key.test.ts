import { describe, it, expect } from 'vitest';
import { normalizeUrlForDraft, normalizeUrlForMemory } from '@/lib/capture/url-key';

describe('normalizeUrlForDraft', () => {
  it('strips hash, keeps query', () => {
    expect(normalizeUrlForDraft('https://a.com/apply?jobId=1#step2'))
      .toBe('https://a.com/apply?jobId=1');
  });

  it('treats different query strings as distinct URLs', () => {
    expect(normalizeUrlForDraft('https://a.com/apply?jobId=1'))
      .not.toBe(normalizeUrlForDraft('https://a.com/apply?jobId=2'));
  });

  it('returns input unchanged if already normalized', () => {
    expect(normalizeUrlForDraft('https://a.com/apply'))
      .toBe('https://a.com/apply');
  });

  it('falls back to raw string on malformed input', () => {
    expect(normalizeUrlForDraft('not a url')).toBe('not a url');
  });
});

describe('normalizeUrlForMemory', () => {
  it('strips hash AND query', () => {
    expect(normalizeUrlForMemory('https://a.com/apply?jobId=1#step2'))
      .toBe('https://a.com/apply');
  });

  it('treats different query strings as same memory key', () => {
    expect(normalizeUrlForMemory('https://a.com/apply?jobId=1'))
      .toBe(normalizeUrlForMemory('https://a.com/apply?jobId=2'));
  });
});

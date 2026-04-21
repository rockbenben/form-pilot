import { describe, it, expect } from 'vitest';
import { resolveCandidate, candidateMatches, type FieldCandidate } from '@/lib/capture/candidate';

function mk(partial: Partial<FieldCandidate>, i = 0): FieldCandidate {
  return {
    id: partial.id ?? `c${i}`,
    value: partial.value ?? `v${i}`,
    displayValue: partial.displayValue,
    label: partial.label,
    hitCount: partial.hitCount ?? 1,
    createdAt: partial.createdAt ?? 0,
    updatedAt: partial.updatedAt ?? 0,
    lastUrl: partial.lastUrl ?? '',
  };
}

describe('resolveCandidate', () => {
  it('picks domain pref first', () => {
    const cs = [mk({ id: 'a', hitCount: 10 }, 0), mk({ id: 'b', hitCount: 1 }, 1)];
    expect(resolveCandidate(cs, null, 'workday.com', { 'workday.com': 'b' })!.id).toBe('b');
  });

  it('falls through to pin when the domain pref points to a missing candidate', () => {
    const cs = [mk({ id: 'a', hitCount: 1 }, 0), mk({ id: 'b', hitCount: 10 }, 1)];
    expect(resolveCandidate(cs, 'a', 'workday.com', { 'workday.com': 'ghost' })!.id).toBe('a');
  });

  it('uses pin when there is no domain pref', () => {
    const cs = [mk({ id: 'a', hitCount: 1 }, 0), mk({ id: 'b', hitCount: 10 }, 1)];
    expect(resolveCandidate(cs, 'a', 'workday.com', {})!.id).toBe('a');
  });

  it('uses highest hitCount when there is no pin', () => {
    const cs = [mk({ id: 'a', hitCount: 1 }, 0), mk({ id: 'b', hitCount: 10 }, 1)];
    expect(resolveCandidate(cs, null, 'workday.com', {})!.id).toBe('b');
  });

  it('breaks hitCount ties by latest updatedAt', () => {
    const cs = [
      mk({ id: 'older', hitCount: 3, updatedAt: 100 }, 0),
      mk({ id: 'newer', hitCount: 3, updatedAt: 200 }, 1),
    ];
    expect(resolveCandidate(cs, null, 'workday.com', {})!.id).toBe('newer');
  });

  it('breaks further ties by earliest createdAt for stability', () => {
    const cs = [
      mk({ id: 'later', hitCount: 3, updatedAt: 100, createdAt: 50 }, 0),
      mk({ id: 'earlier', hitCount: 3, updatedAt: 100, createdAt: 10 }, 1),
    ];
    expect(resolveCandidate(cs, null, 'workday.com', {})!.id).toBe('earlier');
  });

  it('returns null for empty candidate list', () => {
    expect(resolveCandidate([], null, 'workday.com', {})).toBeNull();
  });
});

describe('candidateMatches', () => {
  it('matches on (value, displayValue) pair', () => {
    const c = mk({ value: 'a', displayValue: 'A' });
    expect(candidateMatches(c, 'a', 'A')).toBe(true);
    expect(candidateMatches(c, 'a', 'B')).toBe(false);
    expect(candidateMatches(c, 'b', 'A')).toBe(false);
  });

  it('treats undefined displayValue as empty string for comparison', () => {
    const c = mk({ value: 'a' });
    expect(candidateMatches(c, 'a', undefined)).toBe(true);
    expect(candidateMatches(c, 'a', '')).toBe(true);
  });
});

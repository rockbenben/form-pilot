import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '@/lib/capture/time-format';

describe('formatRelativeTime', () => {
  const now = new Date('2026-04-19T12:00:00Z').getTime();
  const t = (key: string, vars?: Record<string, string | number>) => {
    const map: Record<string, string> = {
      'time.justNow': 'just now',
      'time.minutesAgo': '{n} min ago',
      'time.hoursAgo': '{n} hr ago',
      'time.daysAgo': '{n} days ago',
    };
    let s = map[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  it('returns "just now" for < 60s', () => {
    expect(formatRelativeTime(now - 30_000, now, t)).toBe('just now');
  });

  it('returns minutes for < 60 min', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now, t)).toBe('5 min ago');
  });

  it('returns hours for < 24 h', () => {
    expect(formatRelativeTime(now - 3 * 3_600_000, now, t)).toBe('3 hr ago');
  });

  it('returns days for < 30 d', () => {
    expect(formatRelativeTime(now - 2 * 86_400_000, now, t)).toBe('2 days ago');
  });

  it('returns YYYY-MM-DD for >= 30 d', () => {
    expect(formatRelativeTime(now - 40 * 86_400_000, now, t)).toBe('2026-03-10');
  });
});

type T = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Format a past Unix-ms timestamp as a relative time string.
 *
 * @param past Timestamp in Unix milliseconds (older)
 * @param now  Current time in Unix milliseconds (for testability)
 * @param t    i18n lookup function with placeholder substitution
 */
export function formatRelativeTime(past: number, now: number, t: T): string {
  const diff = Math.max(0, now - past);
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const days = Math.floor(hr / 24);

  if (sec < 60) return t('time.justNow');
  if (min < 60) return t('time.minutesAgo', { n: min });
  if (hr < 24) return t('time.hoursAgo', { n: hr });
  if (days < 30) return t('time.daysAgo', { n: days });

  const d = new Date(past);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

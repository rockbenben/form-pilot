/**
 * Suffix-match a hostname against a list of allowed domains.
 *
 * - `mokahr.com` matches `mokahr.com`, `jobs.mokahr.com`, `www.mokahr.com`.
 * - It does NOT match `faux-mokahr.com` (prefix-only collision).
 * - Entries are normalized to lower-case and leading dots are stripped.
 */
export function matchesAllowedDomain(hostname: string, allowed: string[]): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return allowed.some((raw) => {
    const d = raw.trim().replace(/^\.+/, '').toLowerCase();
    if (!d) return false;
    return h === d || h.endsWith('.' + d);
  });
}

/** Extract hostname from a URL string, or return empty string on parse error. */
export function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Normalize a domain key for matching.
 * This is the single definition of how domain keys are normalized:
 * trimmed, leading dots stripped, lowercased.
 * Future changes to normalization rules (e.g., IDN/punycode handling)
 * must be made here and will apply to all domain-matching logic.
 */
function normalizeDomainKey(raw: string): string {
  return raw.trim().replace(/^\.+/, '').toLowerCase();
}

/**
 * Test if a hostname matches a normalized domain via suffix matching.
 * This is the single definition of what "matches a domain" means:
 * exact match or hostname ends with '.' followed by the domain.
 * Future changes to match logic must be made here and will apply
 * to all domain-matching functions.
 */
function isDomainSuffixMatch(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith('.' + domain);
}

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
    const d = normalizeDomainKey(raw);
    if (!d) return false;
    return isDomainSuffixMatch(h, d);
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

/**
 * Resolve which stored `overrides` key governs a hostname.
 *
 * Keys are suffix-matched exactly like matchesAllowedDomain, so a `mokahr.com`
 * rule covers `jobs.mokahr.com`. When several keys match, the longest wins —
 * a narrow `jobs.example.com` rule beats a broad `example.com` one.
 *
 * Returns the key exactly as stored (not normalized), so callers can use it
 * to `delete` the matching entry from the real overrides object. This is the
 * single definition of the longest-match tie-break; `resolveSiteOverride` is
 * implemented in terms of it.
 */
export function resolveSiteOverrideKey(
  hostname: string,
  overrides: Record<string, 'always' | 'never'>,
): string | undefined {
  if (!hostname) return undefined;
  const h = hostname.toLowerCase();
  let bestKey: string | undefined;
  let bestNormalized = '';
  for (const raw of Object.keys(overrides)) {
    const d = normalizeDomainKey(raw);
    if (!d) continue;
    if (!isDomainSuffixMatch(h, d)) continue;
    if (d.length > bestNormalized.length) {
      bestNormalized = d;
      bestKey = raw;
    }
  }
  return bestKey;
}

/**
 * Resolve a per-site override value for a hostname. See `resolveSiteOverrideKey`
 * for the matching rule this is built on.
 */
export function resolveSiteOverride(
  hostname: string,
  overrides: Record<string, 'always' | 'never'>,
): 'always' | 'never' | undefined {
  const key = resolveSiteOverrideKey(hostname, overrides);
  return key === undefined ? undefined : overrides[key];
}

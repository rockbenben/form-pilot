import { type Settings, DEFAULT_SETTINGS } from './types';

const SETTINGS_KEY = 'formpilot:settings';

/**
 * The domain whitelist FormPilot used to ship before the resume-field probe
 * replaced it. Kept only so the migration can tell a user's own additions from
 * our former defaults. Do not extend.
 */
const LEGACY_DEFAULT_DOMAINS = [
  'mokahr.com', 'moka.com', 'zhaopin.com', 'liepin.com', 'zhipin.com',
  'lagou.com', 'nowcoder.com',
  'myworkday.com', 'myworkdayjobs.com', 'greenhouse.io', 'lever.co',
  'icims.com', 'taleo.net', 'smartrecruiters.com',
  'hotjob.cn', 'beisen.com', 'feishu.cn',
] as const;

/**
 * Fold a legacy `allowedDomains` list into `siteOverrides`.
 *
 * Only domains the user added themselves survive — the entries we shipped as
 * defaults encoded a guess that the resume-field probe now makes better, so
 * they are discarded. Returns the migrated object, or null when there is
 * nothing to do.
 */
function migrateAllowedDomains(base: Partial<Settings>): Partial<Settings> | null {
  const legacy = (base as { allowedDomains?: unknown }).allowedDomains;
  if (!Array.isArray(legacy)) return null;
  const shipped = new Set<string>(LEGACY_DEFAULT_DOMAINS.map((d) => d.toLowerCase()));
  const overrides: Record<string, 'always' | 'never'> = { ...(base.siteOverrides ?? {}) };
  for (const raw of legacy) {
    const d = String(raw).trim().replace(/^\.+/, '').toLowerCase();
    if (!d || shipped.has(d)) continue;
    // A deliberate override the user already set wins over the inferred one.
    if (d in overrides) continue;
    overrides[d] = 'always';
  }
  const { allowedDomains: _legacy, ...rest } = base as Partial<Settings> & { allowedDomains?: unknown };
  return { ...rest, siteOverrides: overrides };
}

/** Return stored settings, falling back to defaults for any missing fields. */
export async function getSettings(): Promise<Settings> {
  const localResult = await chrome.storage.local.get(SETTINGS_KEY);
  let base = (localResult[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {};

  // Lazy migration. A failure here must never block startup — worst case the
  // user re-adds a site override by hand.
  try {
    const migrated = migrateAllowedDomains(base);
    if (migrated) {
      base = migrated;
      await chrome.storage.local.set({ [SETTINGS_KEY]: base });
    }
  } catch {
    /* ignore — treat as if there were no legacy field */
  }

  const merged: Settings = { ...DEFAULT_SETTINGS, ...base };
  // Hand callers a fresh object so ad-hoc mutations never touch the DEFAULT
  // export or the in-memory stored snapshot.
  return { ...merged, siteOverrides: { ...merged.siteOverrides } };
}

/** Shallow-merge a partial settings object and persist the result. */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  let updated: Settings = { ...current, ...patch };

  // A patch may still carry a legacy `allowedDomains` field — e.g. a caller
  // that read stale pre-migration storage before writing it back. Re-run the
  // same migration getSettings() runs so it's folded into siteOverrides
  // immediately instead of being persisted raw. Must never block an update.
  try {
    const migrated = migrateAllowedDomains(updated);
    if (migrated) {
      updated = migrated as Settings;
    }
  } catch {
    /* ignore — treat as if there were no legacy field */
  }

  await chrome.storage.local.set({ [SETTINGS_KEY]: updated });

  return updated;
}

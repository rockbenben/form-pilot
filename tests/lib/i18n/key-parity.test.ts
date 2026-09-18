import { describe, it, expect } from 'vitest';
import { LOCALES, MESSAGES, DEFAULT_LOCALE, type Locale } from '@/lib/i18n';
import { en } from '@/lib/i18n/en';

/**
 * `t()` returns the key itself when a translation is missing
 * (`lib/i18n/index.ts`), so a key present in only one dictionary does not throw,
 * does not warn, and does not fail any test — it just renders `nav.settings` in
 * the middle of the UI, in whichever locale is missing it.
 *
 * With 18 hand-maintained dictionaries this is the single most likely way for
 * the i18n to rot: someone adds a key to `en.ts`, ships, and four locales
 * silently render raw keys. Nothing else in the suite can see that.
 *
 * The dictionaries are literal-keyed objects, so `Object.keys` yields `string[]`
 * that cannot index them directly. Widening here keeps the loops below honest
 * about looking up by an arbitrary key.
 */
const EN = en as Record<string, string>;

const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

/** Every locale except the reference one, with its dictionary. */
const OTHERS = LOCALES.map((l) => l.code)
  .filter((code): code is Locale => code !== DEFAULT_LOCALE)
  .map((code) => ({ code, dict: MESSAGES[code] as Record<string, string> }));

describe('translation dictionaries', () => {
  const enKeys = Object.keys(EN).sort();

  it('covers every locale in LOCALES with a real dictionary', () => {
    // Guard against a vacuous pass: if a dictionary import ever resolved to an
    // empty object, every comparison below would succeed while checking nothing.
    expect(LOCALES.length).toBe(18);
    for (const { code, dict } of OTHERS) {
      expect(Object.keys(dict).length, `${code} is empty`).toBeGreaterThan(0);
    }
    expect(enKeys.length).toBeGreaterThan(200);
  });

  it.each(OTHERS)('$code defines exactly the same keys as en', ({ code, dict }) => {
    expect(Object.keys(dict).sort(), `${code} key set`).toEqual(enKeys);
  });

  it.each(OTHERS)('$code has no empty value', ({ code, dict }) => {
    const empty = enKeys.filter((k) => !dict[k].trim());
    expect(empty, `${code} has blank values`).toEqual([]);
  });

  it.each(OTHERS)('$code leaves no {placeholder} untranslated', ({ code, dict }) => {
    const mismatched = enKeys.filter((k) => placeholders(dict[k]) !== placeholders(EN[k]));
    expect(mismatched, `${code} placeholder drift`).toEqual([]);
  });
});

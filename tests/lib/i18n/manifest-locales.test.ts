import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LOCALES, DEFAULT_LOCALE } from '@/lib/i18n';

/**
 * There are TWO independent locale sets in this project and they are easy to
 * confuse:
 *
 *   1. `public/_locales/<code>/messages.json` — Chrome's manifest localization.
 *      This is what `chrome://extensions` shows for the name/description, and
 *      what the store listing reads. Chrome resolves `__MSG_x__` at load time.
 *   2. `lib/i18n/*.ts` — the in-app UI dictionaries.
 *
 * They are separate mechanisms with separate files, so nothing makes them agree.
 * That is exactly how this project ended up shipping 18 UI languages while the
 * extension showed an English name and description in every locale: set (1) had
 * only `en` + `zh_CN`. No test noticed, because each set was internally
 * consistent.
 *
 * Chrome does NOT fall back per key. If a locale directory exists but is missing
 * a placeholder the manifest references, the extension fails to load entirely —
 * so a half-translated locale is worse than an absent one.
 *
 * These tests pin the two sets together and re-check the hard limits that only
 * surface at upload time.
 */

const ROOT = process.cwd();
const LOCALES_DIR = path.resolve(ROOT, 'public', '_locales');
const CONFIG = path.resolve(ROOT, 'wxt.config.ts');

/** Chrome's limit on the manifest `description` field, after substitution. */
const DESC_LIMIT = 132;

/** The extension name is a brand string — it must not be translated. */
const BRAND = 'FormPilot';

/** Names of competing browsers must never appear in manifest copy. */
const BROWSERS = ['chrome', 'edge', 'firefox', 'safari', 'opera', 'brave', 'vivaldi'];

type Messages = Record<string, { message: string; description?: string }>;

function readMessages(code: string): Messages {
  const file = path.join(LOCALES_DIR, code, 'messages.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Messages;
}

/** Directory names under `public/_locales/`, i.e. the manifest locale set. */
const dirCodes = fs.existsSync(LOCALES_DIR)
  ? fs
      .readdirSync(LOCALES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  : [];

/** Locale codes from the in-app registry, sorted to compare as a set. */
const appCodes = LOCALES.map((l) => l.code).sort() as string[];

/**
 * Placeholders the manifest actually asks for, scraped from the WXT config.
 *
 * Reading the config as text rather than importing it keeps this test free of
 * WXT's build-time machinery, and it still catches the failure that matters:
 * someone adds a `__MSG_x__` to the config and forgets 18 JSON files.
 */
const configSource = fs.readFileSync(CONFIG, 'utf8');
const manifestPlaceholders = [
  ...new Set([...configSource.matchAll(/__MSG_(\w+)__/g)].map((m) => m[1])),
].sort();

describe('manifest locales (public/_locales)', () => {
  it('has a directory per locale, matching the in-app registry exactly', () => {
    // Guards against a vacuous pass if the path resolution ever breaks: an
    // empty directory listing would otherwise compare equal to nothing.
    expect(dirCodes.length, `no locale directories found at ${LOCALES_DIR}`).toBeGreaterThan(0);

    // The whole point of this file. If these ever diverge, one of the two
    // user-visible surfaces is untranslated in some locale.
    expect(dirCodes).toEqual(appCodes);
    expect(dirCodes.length).toBe(18);
  });

  it('declares default_locale and ships that directory', () => {
    expect(configSource).toContain(`default_locale: '${DEFAULT_LOCALE}'`);
    expect(dirCodes).toContain(DEFAULT_LOCALE);
  });

  it('scraped the placeholders it claims to check', () => {
    // If the regex stopped matching, every per-locale check below would pass
    // while verifying nothing.
    expect(manifestPlaceholders).toEqual([
      'commandToggleToolbar',
      'extensionDescription',
      'extensionName',
    ]);
  });

  describe.each(dirCodes)('%s', (code) => {
    const messages = readMessages(code);

    it('defines every placeholder the manifest references', () => {
      const missing = manifestPlaceholders.filter((k) => !(k in messages));
      expect(missing, `${code} is missing manifest messages`).toEqual([]);
    });

    it('uses the {message: string} shape Chrome requires', () => {
      for (const [key, entry] of Object.entries(messages)) {
        expect(typeof entry?.message, `${code}.${key}`).toBe('string');
        expect(entry.message.trim(), `${code}.${key} is blank`).not.toBe('');
      }
    });

    it('keeps the brand name untranslated', () => {
      expect(messages.extensionName.message).toBe(BRAND);
    });

    it(`keeps extensionDescription within ${DESC_LIMIT} characters`, () => {
      const len = messages.extensionDescription.message.length;
      expect(len, `${code} description is ${len} chars`).toBeLessThanOrEqual(DESC_LIMIT);
    });

    it('names no competing browser', () => {
      // Only `message` is checked. The sibling `description` field is a
      // developer note shown in Chrome's own locale tooling, never to a user —
      // and the shipped `en`/`zh_CN` files already point at `chrome://extensions`
      // and the Chrome Web Store there, which is the established convention for
      // this extension's own locale files. Do not extend this loop to
      // `entry.description`; the store-copy rule (no competing browser named)
      // governs `descriptions.json` in the FillDuck project, not these notes.
      for (const [key, entry] of Object.entries(messages)) {
        const low = entry.message.toLowerCase();
        for (const browser of BROWSERS) {
          expect(low, `${code}.${key} names ${browser}`).not.toContain(browser);
        }
      }
    });

    it('contains no bidi control characters', () => {
      // Arabic word order comes from the locale itself. Embedded directional
      // overrides reorder text in editors, diffs and CI logs.
      for (const [key, entry] of Object.entries(messages)) {
        const hasBidi = [...entry.message].some(
          (c) => (c >= '\u202a' && c <= '\u202e') || (c >= '\u2066' && c <= '\u2069'),
        );
        expect(hasBidi, `${code}.${key} has a bidi control char`).toBe(false);
      }
    });
  });
});

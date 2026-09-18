import { createContext, useContext, useState, useCallback, useEffect } from 'react';

import { en } from './en';
import { zh_CN } from './zh_CN';
import { zh_TW } from './zh_TW';
import { ja } from './ja';
import { ko } from './ko';
import { id } from './id';
import { es } from './es';
import { pt_BR } from './pt_BR';
import { it } from './it';
import { fr } from './fr';
import { de } from './de';
import { pl } from './pl';
import { ru } from './ru';
import { tr } from './tr';
import { vi } from './vi';
import { ar } from './ar';
import { hi } from './hi';
import { th } from './th';

/**
 * The 18 locales this extension ships. Codes are Chrome's `_locales/` ids
 * (underscore form), because the same ids name the folders in `public/_locales/`
 * and the manifest's `default_locale`. They are also the keys of
 * `descriptions.json` / `search-terms.json` in the FillDuck project directory,
 * so the store listing and the UI never disagree about which languages exist.
 *
 * `name` is each language's endonym — a language picker that shows "Japanese"
 * to someone who only reads Japanese is not a language picker. These are
 * deliberately NOT translation keys: they are the same 18 strings in every
 * locale, and 18×18 labels would be noise.
 */
export const LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'zh_CN', name: '简体中文' },
  { code: 'zh_TW', name: '繁體中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'es', name: 'Español' },
  { code: 'pt_BR', name: 'Português (Brasil)' },
  { code: 'it', name: 'Italiano' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pl', name: 'Polski' },
  { code: 'ru', name: 'Русский' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'th', name: 'ไทย' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

type Messages = Record<string, string>;

export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Every dictionary, keyed by locale. Exported so the parity test can assert the
 * 18-locale invariant generically — with 18 hand-maintained files, "did someone
 * forget a key in `th.ts`" is exactly the failure that no single-locale test
 * can catch, and `t()` silently falls back to rendering the raw key.
 */
export const MESSAGES: Record<Locale, Messages> = {
  en,
  zh_CN,
  zh_TW,
  ja,
  ko,
  id,
  es,
  pt_BR,
  it,
  fr,
  de,
  pl,
  ru,
  tr,
  vi,
  ar,
  hi,
  th,
};

/** Locales written right-to-left. Their UI needs `dir="rtl"`, not just strings. */
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * The "leads to" arrow for a locale — `→` in LTR, `←` in RTL.
 *
 * Arrows are NOT Bidi_Mirrored, so `dir="rtl"` does not flip `→`. A
 * right-to-left row that renders `domain → candidate` therefore puts the
 * candidate on the left and leaves the arrow pointing back at the domain it
 * came from. Parentheses and guillemets *are* mirrored, which is why only the
 * arrow needs to be picked by hand.
 */
export function arrow(locale: Locale): string {
  return isRtl(locale) ? '←' : '→';
}

const LOCALE_CODES = new Set<string>(LOCALES.map((l) => l.code));

/**
 * Normalise a locale tag for comparison: underscores and hyphens are
 * interchangeable and case is ignored, so `zh-CN`, `zh_CN` and `ZH-cn` all fold
 * together. Chrome hands back BCP-47 (`zh-CN`); our ids are the `_locales` form
 * (`zh_CN`).
 */
export function canonLocale(tag: string): string {
  return tag.replace(/_/g, '-').toLowerCase();
}

const BY_CANON = new Map<string, Locale>(LOCALES.map((l) => [canonLocale(l.code), l.code]));
const BY_BASE = new Map<string, Locale>(LOCALES.map((l) => [canonLocale(l.code).split('-')[0], l.code]));

/** Which language a browser tag should open in. Exported for testing. */
export function localeForTag(tag: string): Locale | null {
  const canon = canonLocale(tag);
  if (!canon) return null;
  const exact = BY_CANON.get(canon);
  if (exact) return exact;
  // Traditional-Chinese regions: Hong Kong and Macao read Traditional, so they
  // belong with zh_TW rather than falling through to Simplified.
  if (/^zh-(hk|mo|hant)\b/.test(canon)) return 'zh_TW';
  // Anything else Chinese (zh, zh-SG, zh-Hans…) is Simplified.
  const base = canon.split('-')[0];
  if (base === 'zh') return 'zh_CN';
  return BY_BASE.get(base) ?? null;
}

/**
 * Pick a locale when the user has no stored preference, from Chrome's UI
 * language (what they chose in browser settings). Unsupported languages fall
 * back to English, which is also the manifest's `default_locale`.
 *
 * Gracefully falls back to English if chrome.i18n is unavailable (e.g. tests).
 */
export function detectDefaultLocale(): Locale {
  try {
    const ui = chrome?.i18n?.getUILanguage?.() ?? '';
    return localeForTag(ui) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Resolve locale from storage, falling back to browser detection.
 *
 * `zh` is accepted as an alias for `zh_CN`: it is what the two-language version
 * of this extension wrote to `formpilot:locale`, and dropping it would silently
 * move every existing Chinese user to English on upgrade.
 */
export function resolveLocale(stored: unknown): Locale {
  if (typeof stored === 'string') {
    if (stored === 'zh') return 'zh_CN';
    if (LOCALE_CODES.has(stored)) return stored as Locale;
    const byTag = localeForTag(stored);
    if (byTag) return byTag;
  }
  return detectDefaultLocale();
}

/** Keep the document's `lang`/`dir` in step with the UI language. */
function applyDocumentLocale(locale: Locale): void {
  try {
    document.documentElement.lang = locale.replace('_', '-');
    document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
  } catch {
    /* no document (tests, service worker) */
  }
}

/**
 * Apply the locale's direction to one of *our* elements.
 *
 * The content script's in-page UI (toolbar, draft badge, candidate picker) lives
 * in shadow roots attached to someone else's page, so `applyDocumentLocale` is
 * the wrong tool there — it would flip the direction of the site the user is
 * filling in. Every in-page mount calls this on its own container instead, which
 * is the only element whose direction we are entitled to change.
 */
export function applyElementDirection(el: HTMLElement, locale: Locale): void {
  el.dir = isRtl(locale) ? 'rtl' : 'ltr';
}

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextType>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, _vars) => key,
});

export function useI18n() {
  return useContext(I18nContext);
}

export function useI18nProvider(): I18nContextType {
  const [locale, setLocaleState] = useState<Locale>(() => detectDefaultLocale());

  useEffect(() => {
    // Override detected default with user's stored preference, if any.
    chrome.storage.local.get('formpilot:locale').then((result) => {
      setLocaleState(resolveLocale(result['formpilot:locale']));
    });
  }, []);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    chrome.storage.local.set({ 'formpilot:locale': newLocale });
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      let s = MESSAGES[locale][key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [locale],
  );

  return { locale, setLocale, t };
}

/** Standalone t function for use outside React context (e.g. toolbar Shadow DOM). */
export function makeT(locale: Locale): (key: string, vars?: Record<string, string | number>) => string {
  return (key, vars) => {
    let s = MESSAGES[locale][key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

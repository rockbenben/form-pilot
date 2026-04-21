import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { zh } from './zh';
import { en } from './en';

type Locale = 'zh' | 'en';
type Messages = Record<string, string>;

const translations: Record<Locale, Messages> = { zh, en };

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextType>({
  locale: 'zh',
  setLocale: () => {},
  t: (key, _vars) => key,
});

export function useI18n() {
  return useContext(I18nContext);
}

/**
 * Pick a default locale when the user has no stored preference.
 * Uses Chrome's UI language (what the user picked in browser settings).
 * Anything starting with `zh` → 'zh'; everything else → 'en'.
 *
 * Gracefully falls back to 'en' if chrome.i18n is unavailable (e.g. tests).
 */
export function detectDefaultLocale(): Locale {
  try {
    const ui = chrome?.i18n?.getUILanguage?.() ?? '';
    return ui.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

/** Resolve locale from storage, falling back to browser detection. */
export function resolveLocale(stored: unknown): Locale {
  if (stored === 'zh' || stored === 'en') return stored;
  return detectDefaultLocale();
}

export function useI18nProvider(): I18nContextType {
  const [locale, setLocaleState] = useState<Locale>(() => detectDefaultLocale());

  useEffect(() => {
    // Override detected default with user's stored preference, if any.
    chrome.storage.local.get('formpilot:locale').then((result) => {
      const saved = result['formpilot:locale'] as Locale;
      if (saved && (saved === 'zh' || saved === 'en')) {
        setLocaleState(saved);
      }
    });
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    chrome.storage.local.set({ 'formpilot:locale': newLocale });
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      let s = translations[locale][key] ?? key;
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
    let s = translations[locale][key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

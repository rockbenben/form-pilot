import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { zh } from './zh';
import { en } from './en';

type Locale = 'zh' | 'en';
type Messages = Record<string, string>;

const translations: Record<Locale, Messages> = { zh, en };

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

export const I18nContext = createContext<I18nContextType>({
  locale: 'zh',
  setLocale: () => {},
  t: (key) => key,
});

export function useI18n() {
  return useContext(I18nContext);
}

export function useI18nProvider(): I18nContextType {
  const [locale, setLocaleState] = useState<Locale>('zh');

  useEffect(() => {
    // Load saved locale from storage
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

  const t = useCallback((key: string): string => {
    return translations[locale][key] ?? key;
  }, [locale]);

  return { locale, setLocale, t };
}

/** Standalone t function for use outside React context (e.g. toolbar Shadow DOM). */
export function makeT(locale: Locale): (key: string) => string {
  return (key: string) => translations[locale][key] ?? key;
}

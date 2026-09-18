import { describe, it, expect, afterEach } from 'vitest';
import {
  LOCALES,
  DEFAULT_LOCALE,
  canonLocale,
  localeForTag,
  isRtl,
  arrow,
  detectDefaultLocale,
  resolveLocale,
  applyElementDirection,
} from '@/lib/i18n';

// The tests/setup.ts mock stubs globalThis.chrome; we shim getUILanguage per-test.
const origGetUILanguage = chrome.i18n?.getUILanguage;

function setBrowserLang(lang: string | undefined): void {
  if (!chrome.i18n) {
    (chrome as unknown as { i18n: Record<string, unknown> }).i18n = {};
  }
  (chrome.i18n as unknown as { getUILanguage?: () => string }).getUILanguage =
    lang === undefined ? undefined : () => lang;
}

afterEach(() => {
  setBrowserLang(origGetUILanguage?.() ?? '');
});

describe('LOCALES', () => {
  it('ships 18 locales, all unique, with endonyms', () => {
    expect(LOCALES).toHaveLength(18);
    expect(new Set(LOCALES.map((l) => l.code)).size).toBe(18);
    // The picker shows these, so an empty or Latin-transliterated name would be
    // a regression: someone who reads only ไทย must see ไทย, not "Thai".
    for (const { code, name } of LOCALES) {
      expect(name.trim(), `${code} name`).not.toBe('');
    }
  });

  it('uses the same locale ids as the store-listing assets', () => {
    // These are the keys of descriptions.json / search-terms.json. If they drift,
    // the store listing and the UI disagree about which languages exist.
    expect(LOCALES.map((l) => l.code)).toEqual([
      'en', 'zh_CN', 'zh_TW', 'ja', 'ko', 'id', 'es', 'pt_BR', 'it', 'fr',
      'de', 'pl', 'ru', 'tr', 'vi', 'ar', 'hi', 'th',
    ]);
  });

  it('marks only Arabic as right-to-left', () => {
    expect(LOCALES.filter((l) => isRtl(l.code)).map((l) => l.code)).toEqual(['ar']);
  });
});

describe('arrow', () => {
  it('points along the reading direction', () => {
    expect(arrow('en')).toBe('→');
    expect(arrow('zh_CN')).toBe('→');
    expect(arrow('ar')).toBe('←');
  });

  it('is RTL exactly where isRtl says so', () => {
    // Arrows are NOT Bidi_Mirrored, so `dir="rtl"` will not flip a literal `→`.
    // If a locale is ever added to RTL_LOCALES, this must pick it up with no
    // second edit — otherwise that language silently ships a backwards arrow.
    for (const { code } of LOCALES) {
      expect(arrow(code), code).toBe(isRtl(code) ? '←' : '→');
    }
  });
});

describe('canonLocale', () => {
  it('folds underscore/hyphen and case together', () => {
    expect(canonLocale('zh_CN')).toBe('zh-cn');
    expect(canonLocale('zh-CN')).toBe('zh-cn');
    expect(canonLocale('ZH-cn')).toBe('zh-cn');
    expect(canonLocale('pt_BR')).toBe('pt-br');
  });
});

describe('localeForTag', () => {
  it('matches exact tags in either separator form', () => {
    expect(localeForTag('zh-CN')).toBe('zh_CN');
    expect(localeForTag('zh_CN')).toBe('zh_CN');
    expect(localeForTag('pt-BR')).toBe('pt_BR');
    expect(localeForTag('en')).toBe('en');
  });

  it('sends Traditional-Chinese regions to zh_TW', () => {
    // Hong Kong and Macao read Traditional, so folding them into Simplified
    // would be a visible script change, not just a wording one.
    expect(localeForTag('zh-TW')).toBe('zh_TW');
    expect(localeForTag('zh-HK')).toBe('zh_TW');
    expect(localeForTag('zh-MO')).toBe('zh_TW');
    expect(localeForTag('zh-Hant')).toBe('zh_TW');
    expect(localeForTag('zh-Hant-TW')).toBe('zh_TW');
  });

  it('sends other Chinese tags to zh_CN', () => {
    expect(localeForTag('zh')).toBe('zh_CN');
    expect(localeForTag('zh-SG')).toBe('zh_CN');
    expect(localeForTag('zh-Hans')).toBe('zh_CN');
    expect(localeForTag('zh-Hans-CN')).toBe('zh_CN');
  });

  it('falls back to the base language for unsupported regions', () => {
    expect(localeForTag('de-AT')).toBe('de');
    expect(localeForTag('fr-CA')).toBe('fr');
    expect(localeForTag('es-419')).toBe('es');
    // We only ship Brazilian Portuguese; showing it to a pt-PT user beats English.
    expect(localeForTag('pt-PT')).toBe('pt_BR');
  });

  it('returns null for languages we do not ship', () => {
    expect(localeForTag('sv')).toBeNull();
    expect(localeForTag('xx')).toBeNull();
    expect(localeForTag('')).toBeNull();
  });
});

describe('detectDefaultLocale', () => {
  it('opens Chinese browsers in the matching script', () => {
    setBrowserLang('zh-CN');
    expect(detectDefaultLocale()).toBe('zh_CN');
    setBrowserLang('zh-TW');
    expect(detectDefaultLocale()).toBe('zh_TW');
    setBrowserLang('zh');
    expect(detectDefaultLocale()).toBe('zh_CN');
  });

  it('opens a supported browser language in that language', () => {
    setBrowserLang('ja');
    expect(detectDefaultLocale()).toBe('ja');
    setBrowserLang('fr-FR');
    expect(detectDefaultLocale()).toBe('fr');
    setBrowserLang('pt-BR');
    expect(detectDefaultLocale()).toBe('pt_BR');
    setBrowserLang('en-US');
    expect(detectDefaultLocale()).toBe('en');
  });

  it('falls back to English for unsupported languages', () => {
    setBrowserLang('sv-SE');
    expect(detectDefaultLocale()).toBe(DEFAULT_LOCALE);
  });

  it('returns en when chrome.i18n.getUILanguage is missing', () => {
    setBrowserLang(undefined);
    expect(detectDefaultLocale()).toBe('en');
  });
});

describe('applyElementDirection', () => {
  it('sets rtl for Arabic and ltr for everything else', () => {
    const el = document.createElement('div');
    applyElementDirection(el, 'ar');
    expect(el.dir).toBe('rtl');
    for (const { code } of LOCALES) {
      if (code === 'ar') continue;
      applyElementDirection(el, code);
      expect(el.dir, code).toBe('ltr');
    }
  });

  it('never touches the surrounding document', () => {
    // The in-page UI lives in a shadow root on someone else's page. Setting
    // direction on documentElement would flip the site being filled in.
    const before = document.documentElement.dir;
    applyElementDirection(document.createElement('div'), 'ar');
    expect(document.documentElement.dir).toBe(before);
  });
});

describe('resolveLocale', () => {
  it('returns a stored locale id unchanged', () => {
    for (const { code } of LOCALES) {
      expect(resolveLocale(code), code).toBe(code);
    }
  });

  it('migrates the legacy two-language "zh" value', () => {
    // The previous version of this extension only had zh + en and wrote the bare
    // string "zh". Dropping the alias would move every existing Chinese user to
    // English on upgrade — a silent, unannounced language change.
    setBrowserLang('en-US');
    expect(resolveLocale('zh')).toBe('zh_CN');
  });

  it('accepts a BCP-47 tag where an id was expected', () => {
    expect(resolveLocale('zh-TW')).toBe('zh_TW');
    expect(resolveLocale('pt-BR')).toBe('pt_BR');
  });

  it('falls back to detectDefaultLocale when stored is missing or invalid', () => {
    setBrowserLang('en-US');
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale('xx')).toBe('en');
    expect(resolveLocale(42)).toBe('en');
    expect(resolveLocale({ locale: 'zh' })).toBe('en');

    setBrowserLang('zh-CN');
    expect(resolveLocale(undefined)).toBe('zh_CN');
    expect(resolveLocale('xx')).toBe('zh_CN');
  });
});

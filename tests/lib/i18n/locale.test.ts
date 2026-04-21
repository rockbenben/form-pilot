import { describe, it, expect, afterEach } from 'vitest';
import { detectDefaultLocale, resolveLocale } from '@/lib/i18n';

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

describe('detectDefaultLocale', () => {
  it('returns zh for zh-CN', () => {
    setBrowserLang('zh-CN');
    expect(detectDefaultLocale()).toBe('zh');
  });

  it('returns zh for zh-TW', () => {
    setBrowserLang('zh-TW');
    expect(detectDefaultLocale()).toBe('zh');
  });

  it('returns zh for bare zh', () => {
    setBrowserLang('zh');
    expect(detectDefaultLocale()).toBe('zh');
  });

  it('returns en for en-US', () => {
    setBrowserLang('en-US');
    expect(detectDefaultLocale()).toBe('en');
  });

  it('returns en for ja / fr / anything non-zh', () => {
    setBrowserLang('ja');
    expect(detectDefaultLocale()).toBe('en');
    setBrowserLang('fr-FR');
    expect(detectDefaultLocale()).toBe('en');
  });

  it('returns en when chrome.i18n.getUILanguage is missing', () => {
    setBrowserLang(undefined);
    expect(detectDefaultLocale()).toBe('en');
  });
});

describe('resolveLocale', () => {
  it('returns the stored value when it is a valid locale', () => {
    expect(resolveLocale('zh')).toBe('zh');
    expect(resolveLocale('en')).toBe('en');
  });

  it('falls back to detectDefaultLocale when stored is undefined or invalid', () => {
    setBrowserLang('en-US');
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale('xx')).toBe('en');

    setBrowserLang('zh-CN');
    expect(resolveLocale(undefined)).toBe('zh');
    expect(resolveLocale('xx')).toBe('zh');
  });
});

import { describe, it, expect } from 'vitest';
import { PRESENT, isPresent, renderPresent } from '@/lib/present-date';

function docWith(lang: string | null, title = ''): Document {
  const d = document.implementation.createHTMLDocument(title);
  if (lang !== null) d.documentElement.setAttribute('lang', lang);
  return d;
}

describe('present-date', () => {
  it('recognises the sentinel the import extractor writes', () => {
    expect(isPresent(PRESENT)).toBe(true);
    expect(isPresent('2021-03')).toBe(false);
    expect(isPresent('')).toBe(false);
    expect(isPresent('至今')).toBe(false);   // stored form is the sentinel, not the display text
  });

  // The value is typed into *that page's* form, so the page's language decides —
  // someone browsing a Chinese board in an English UI still needs 至今 in the box.
  it('renders in the language of the page being filled', () => {
    expect(renderPresent(docWith('zh-CN'))).toBe('至今');
    expect(renderPresent(docWith('zh'))).toBe('至今');
    expect(renderPresent(docWith('en-US'))).toBe('Present');
    expect(renderPresent(docWith('de'))).toBe('Present');
  });

  it('falls back to sniffing the title when the page sets no lang', () => {
    expect(renderPresent(docWith(null, '我的简历_猎聘'))).toBe('至今');
    expect(renderPresent(docWith(null, 'Workday Careers'))).toBe('Present');
  });
});

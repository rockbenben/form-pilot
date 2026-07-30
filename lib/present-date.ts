/**
 * The sentinel a still-current job or project stores in its `endDate`.
 *
 * The import extractor has always written this for 「…-至今」 ranges, but
 * nothing else knew about it, so it leaked in two directions: the Dashboard
 * put it in an `<input type="month">`, which cannot hold a non-date and
 * rendered blank — editing any other field in that entry then wrote the blank
 * back and the value was gone — and a fill typed the literal English word
 * `present` into Chinese application forms.
 */
export const PRESENT = 'present';

/** True for an end date that means "still here". */
export function isPresent(value: string): boolean {
  return value === PRESENT;
}

/**
 * Render `PRESENT` in the language of the page it is about to be typed into.
 *
 * The page's own language is the right signal here, not the extension's UI
 * locale: the text lands in that page's form, and someone reading a Chinese
 * board in an English UI still needs 至今 in the box. Every board surveyed
 * sets `lang`; the CJK sniff only covers pages that leave it off.
 */
export function renderPresent(doc: Document): string {
  const lang = (doc.documentElement.getAttribute('lang') ?? '').toLowerCase();
  if (lang.startsWith('zh')) return '至今';
  if (lang) return 'Present';
  return /[一-龥]/.test(doc.title) ? '至今' : 'Present';
}

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A complete dictionary does not mean a localized UI.
 *
 * `t()` returns the key itself when a translation is missing, so every
 * key-parity test in this suite can pass while a component ships
 * `title="Delete"` — a string that never touches the dictionaries and stays
 * English in all 18 languages. Nothing else in the suite can see that: there is
 * no missing key to detect, because no key is involved at all.
 *
 * That was a real defect: `CandidateListField` hardcoded four tooltips whose
 * exact counterparts were already localized two files away (the same ✎/🗑
 * buttons use `t()` in `SavedPages.tsx` and `CandidatePicker.tsx`).
 *
 * So: scan the text-bearing attributes and require that each one either calls
 * `t()` or is on the deliberate-literal list below.
 */

const ROOTS = ['components', 'entrypoints'];

/** Attributes whose value ends up on screen or in an accessible name. */
const TEXT_ATTR = /\b(title|aria-label|aria-description|placeholder|alt)\s*=\s*/g;

/**
 * Deliberate literals — everything here is a *format example* or a brand name,
 * never prose. Keep this list short and justified; adding to it is the signal
 * that a string should have been a key.
 */
const ALLOWED = new Set([
  // Brand — must not be translated in any language.
  'FormPilot',
  // Example placeholders. Values the user types, not interface copy: a Chinese
  // name for the 姓名 field, an internationally readable school/company/role.
  '张三',
  'San Zhang',
  'Peking University',
  'Computer Science',
  'Alibaba',
  'Software Engineer',
]);

/**
 * Copy-like = two consecutive letters, or any CJK.
 *
 * This deliberately lets through the two families of literal that are *not*
 * prose and must not be translated:
 *   - format examples with no words in them: `2015-03`, `3.8`, `4.0`, `30-40K`
 *   - URLs: `https://github.com/username` is the same in every language
 */
function looksLikeCopy(s: string): boolean {
  if (/^https?:\/\//i.test(s) || s.includes('://')) return false;
  return /[A-Za-z]{2}/.test(s) || /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(s);
}

function tsxFiles(): string[] {
  const out: string[] = [];
  for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const rel of fs.readdirSync(root, { recursive: true }) as string[]) {
      if (rel.endsWith('.tsx')) out.push(path.join(root, rel));
    }
  }
  return out;
}

type Hit = { file: string; line: number; attr: string; value: string };

const violations: Hit[] = [];
let attrCount = 0;
let localizedCount = 0;

for (const file of tsxFiles()) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments
    for (const m of line.matchAll(TEXT_ATTR)) {
      attrCount += 1;
      const rest = line.slice(m.index + m[0].length);
      // Localized if the value (or the rest of the expression) calls t().
      if (/\bt\(/.test(rest)) {
        localizedCount += 1;
        continue;
      }
      // Otherwise any quoted literal in the value is suspect.
      for (const lit of rest.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
        const value = lit[1] ?? lit[2] ?? '';
        if (!looksLikeCopy(value)) continue;
        if (ALLOWED.has(value)) continue;
        violations.push({ file, line: idx + 1, attr: m[1], value });
      }
    }
  });
}

describe('no hardcoded interface copy', () => {
  it('scanned the components it claims to scan', () => {
    // Guards against a vacuous pass: if the regex or the file walk ever breaks,
    // `violations` would be empty for the wrong reason.
    expect(tsxFiles().length, 'no .tsx files found').toBeGreaterThan(20);
    expect(attrCount, 'no text-bearing attributes found').toBeGreaterThan(80);
    expect(localizedCount, 'nothing was localized — scan looks broken').toBeGreaterThan(50);
  });

  it('localizes every text-bearing attribute, or lists it as deliberate', () => {
    const report = violations
      .map((v) => `${v.file}:${v.line} ${v.attr}="${v.value}"`)
      .join('\n');
    expect(violations, `hardcoded copy found:\n${report}`).toEqual([]);
  });
});

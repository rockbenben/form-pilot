import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RTL_LOCALES } from '@/lib/i18n';

/**
 * RTL support has two halves, and the second one is the one that rots.
 *
 *   1. **Direction** — put `dir="rtl"` on the right element. Visible, cheap, and
 *      done: `applyDocumentLocale` for the popup/dashboard, and
 *      `applyElementDirection` for the three in-page shadow mounts (toolbar,
 *      draft badge, candidate picker), which must set direction on *our*
 *      container rather than the host page's `<html>`.
 *
 *   2. **Layout** — write every direction-sensitive style with a *logical*
 *      property. `dir="rtl"` mirrors inline flow, but it does nothing at all for
 *      `margin-left`, `text-align: left` or `border-right`; those stay pinned to
 *      the physical side and the layout does not mirror.
 *
 * Half 2 fails invisibly, which is why it needs a test. A physical style is
 * *correct* in the 17 LTR locales — i.e. in every locale the developer is
 * looking at — so nothing looks wrong until someone switches to Arabic.
 *
 * Arabic did ship with half 1 only: `dir="rtl"` was applied correctly while
 * every direction-sensitive style in the repo was physical (22 Tailwind classes
 * and 13 inline declarations, and zero logical properties anywhere).
 *
 * The one deliberate exemption is the floating toolbar's drag position: it comes
 * from `clientX` / `getBoundingClientRect()`, which are physical viewport
 * coordinates, so mirroring it would move the toolbar somewhere the user did not
 * put it. That exemption is scoped per-property, not per-file, so a *new*
 * physical style in the same file still fails.
 */

const ROOTS = ['components', 'entrypoints'];

/**
 * Tailwind utilities whose name IS the whole token, so there is no value suffix
 * to key off (`text-left`, `border-r`).
 */
const PHYSICAL_BARE = new Set([
  'text-left',
  'text-right',
  'border-l',
  'border-r',
  'rounded-l',
  'rounded-r',
  'float-left',
  'float-right',
]);

/**
 * Tailwind utilities shaped `<name>-<value>` (`ml-2`, `border-r-2`,
 * `first:rounded-l-full`). The trailing hyphen is required, which is what keeps
 * `rounded-l` out of `rounded-lg` and `border-r` out of `border-red-900/40` —
 * both symmetric/colour utilities that must NOT be "fixed".
 *
 * `space-x-*` is deliberately absent: Tailwind v4 already compiles it to
 * `margin-inline-start` / `margin-inline-end` (verified against the built CSS),
 * so it mirrors correctly and flagging it would be a false positive.
 */
const PHYSICAL_VALUED =
  /^-?(?:[\w-]+:)*(ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r|left|right)-/;

/** The logical counterparts, counted only to prove the scan is not blind. */
const LOGICAL_BARE = new Set([
  'text-start',
  'text-end',
  'border-s',
  'border-e',
  'rounded-s',
  'rounded-e',
  'float-start',
  'float-end',
]);
const LOGICAL_VALUED =
  /^-?(?:[\w-]+:)*(ms|me|ps|pe|border-s|border-e|rounded-s|rounded-e|start|end)-/;

type Kind = 'physical' | 'logical';

/**
 * Classify one class token, ignoring any variant prefixes (`first:`, `hover:`)
 * and a leading `-` for negative utilities.
 *
 * A bare `left`/`right` is not a Tailwind utility (the real ones are `left-0`,
 * `right-0`), so it classifies as nothing — otherwise the *value* in
 * `textAlign: 'left'` would be double-reported by the style-key check below.
 */
function classifyClass(token: string): { kind: Kind; name: string } | null {
  const bare = token.replace(/^-/, '');
  const name = bare.split(':').pop() ?? '';
  if (PHYSICAL_BARE.has(name)) return { kind: 'physical', name };
  if (LOGICAL_BARE.has(name)) return { kind: 'logical', name };
  const p = PHYSICAL_VALUED.exec(token);
  if (p) return { kind: 'physical', name: p[1] };
  const l = LOGICAL_VALUED.exec(token);
  if (l) return { kind: 'logical', name: l[1] };
  return null;
}

/**
 * Inline style keys that pin to a physical side.
 *
 * Case matters: `marginLeft` must be listed, because lowercase `left` will not
 * match inside it.
 */
const PHYSICAL_STYLE_KEY =
  /\b(left|right|marginLeft|marginRight|paddingLeft|paddingRight|borderLeftWidth|borderRightWidth|borderLeftStyle|borderRightStyle|borderLeftColor|borderRightColor|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius)\s*:/;

/** `textAlign: 'left'` is physical; `'start'` is the logical equivalent. */
const PHYSICAL_TEXT_ALIGN = /\btextAlign\s*:\s*['"](left|right)['"]/;

const LOGICAL_STYLE_KEY =
  /\b(insetInlineStart|insetInlineEnd|marginInlineStart|marginInlineEnd|paddingInlineStart|paddingInlineEnd|borderInlineStartWidth|borderInlineEndWidth)\s*:/;

/**
 * Physical styles that are correct as written, keyed by file and then by the
 * exact property. Scoping to the property — rather than exempting the file —
 * means a new physical style in an exempt file still fails the test.
 */
const ALLOWED: Record<string, Set<string>> = {
  'components/toolbar/mount.tsx': new Set(['left']),
};

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const rel of fs.readdirSync(root, { recursive: true }) as string[]) {
      if (rel.endsWith('.tsx') || rel.endsWith('.ts')) out.push(path.join(root, rel));
    }
  }
  return out.sort();
}

type Violation = { file: string; line: number; kind: string; found: string };

const violations: Violation[] = [];
/**
 * Literal `→` in a rendered position. Arrows are NOT Bidi_Mirrored, so
 * `dir="rtl"` leaves them pointing right while the row around them flips —
 * `domain → candidate` ends up with the arrow aimed back at the domain. Use
 * `arrow(locale)` from `@/lib/i18n`, which returns `←` for RTL.
 */
const arrowViolations: Violation[] = [];
let scannedFiles = 0;
let classTokens = 0;
let logicalCount = 0;

for (const file of sourceFiles()) {
  scannedFiles += 1;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const exempt = ALLOWED[file.replace(/\\/g, '/')];

  lines.forEach((line, idx) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comment line
    const at = idx + 1;

    // Trailing `// ...` is a comment too. The lookbehind keeps `https://` intact.
    const code = line.replace(/(?<=\s)\/\/.*$/, '');
    if (code.includes('→')) {
      arrowViolations.push({ file, line: at, kind: 'literal arrow', found: '→' });
    }

    // --- Tailwind class tokens, from every quoted / template literal ---
    for (const lit of line.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)) {
      const body = lit[1] ?? lit[2] ?? lit[3] ?? '';
      for (const token of body.split(/\s+/)) {
        if (!token) continue;
        classTokens += 1;
        const c = classifyClass(token);
        if (!c) continue;
        if (c.kind === 'logical') {
          logicalCount += 1;
          continue;
        }
        if (exempt?.has(c.name)) continue;
        violations.push({ file, line: at, kind: `class ${token}`, found: token });
      }
    }

    // --- Inline style declarations ---
    for (const m of line.matchAll(new RegExp(PHYSICAL_STYLE_KEY.source, 'g'))) {
      if (exempt?.has(m[1])) continue;
      violations.push({ file, line: at, kind: 'style key', found: m[1] });
    }
    if (LOGICAL_STYLE_KEY.test(line)) logicalCount += 1;
    const ta = PHYSICAL_TEXT_ALIGN.exec(line);
    if (ta) violations.push({ file, line: at, kind: 'textAlign', found: ta[1] });
  });
}

describe('RTL layout mirrors, not just the text', () => {
  it('classifies the ambiguous utilities correctly', () => {
    // These must NOT be flagged. Each contains a physical utility name as a
    // prefix, so a naive prefix match "fixes" a symmetric corner radius or a
    // colour and breaks the LTR layout.
    expect(classifyClass('rounded-lg')).toBeNull();
    expect(classifyClass('border-red-900/40')).toBeNull();
    expect(classifyClass('leading-none')).toBeNull();
    expect(classifyClass('items-end')).toBeNull();
    // Tailwind v4 compiles space-x-* to margin-inline-*, so it already mirrors.
    expect(classifyClass('space-x-2')).toBeNull();

    // Physical — must be flagged.
    expect(classifyClass('ml-2')?.kind).toBe('physical');
    expect(classifyClass('text-left')?.kind).toBe('physical');
    expect(classifyClass('border-r')?.kind).toBe('physical');
    expect(classifyClass('border-r-2')?.kind).toBe('physical');
    expect(classifyClass('first:rounded-l-full')?.kind).toBe('physical');
    // Note `rounded-l-lg` IS physical (`border-top-left-radius`) even though
    // `rounded-lg` is not — only the `-l`/`-r` side suffix makes it directional.
    expect(classifyClass('rounded-l-lg')?.kind).toBe('physical');
    expect(classifyClass('-ml-2')?.kind).toBe('physical');
    expect(classifyClass('left-0')?.kind).toBe('physical');

    // Logical — must be counted, not flagged.
    expect(classifyClass('text-start')?.kind).toBe('logical');
    expect(classifyClass('border-e-2')?.kind).toBe('logical');
    expect(classifyClass('ms-2')?.kind).toBe('logical');
    expect(classifyClass('ps-0.5')?.kind).toBe('logical');
    expect(classifyClass('last:rounded-e-full')?.kind).toBe('logical');
  });

  it('scanned the components it claims to scan', () => {
    // Guards against a vacuous pass: if the walk or the tokenizer breaks, the
    // violation list would be empty for the wrong reason.
    expect(scannedFiles, 'no source files found').toBeGreaterThan(20);
    expect(classTokens, 'no class tokens found').toBeGreaterThan(200);
    expect(logicalCount, 'no logical direction styles found — scan looks broken')
      .toBeGreaterThan(10);
  });

  it('uses logical direction properties, not physical ones', () => {
    const report = violations
      .map((v) => `${v.file}:${v.line} [${v.kind}] ${v.found}`)
      .join('\n');
    expect(
      violations,
      `physical direction styles found — these do not mirror under dir="rtl":\n${report}`,
    ).toEqual([]);
  });

  it('uses arrow(locale) instead of a literal right-pointing arrow', () => {
    const report = arrowViolations.map((v) => `${v.file}:${v.line}`).join('\n');
    expect(
      arrowViolations,
      'literal arrows found — arrows are NOT Bidi_Mirrored, so `dir="rtl"` ' +
        `leaves them pointing right while the row around them flips. ` +
        `Use arrow(locale) from @/lib/i18n:\n${report}`,
    ).toEqual([]);
  });

  it('has no LTR-only arrows baked into the RTL dictionaries', () => {
    // The "Manage all candidates →" affordance carries its arrow inside the
    // translated string, so the sweep above cannot see it.
    expect(RTL_LOCALES.length, 'no RTL locales — the check is broken')
      .toBeGreaterThan(0);
    for (const code of RTL_LOCALES) {
      const file = path.join('lib', 'i18n', `${code}.ts`);
      const bad: string[] = [];
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, idx) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (line.includes('→')) bad.push(`${file}:${idx + 1}  ${line.trim()}`);
      });
      expect(bad, `${code} has an LTR-only arrow:\n${bad.join('\n')}`).toEqual([]);
    }
  });

  it('applies direction to our own container in every in-page mount', () => {
    // The other half of RTL. A mount that renders our UI without setting
    // direction leaves the toolbar/badge/picker LTR on an RTL page.
    for (const file of [
      'components/toolbar/mount.tsx',
      'components/capture/mount-badge.tsx',
      'components/capture/mount-candidate-picker.tsx',
    ]) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src, `${file} never calls applyElementDirection`).toContain(
        'applyElementDirection(',
      );
    }
  });
});

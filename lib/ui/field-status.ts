import type { FillStatus } from '@/lib/engine/adapters/types';

/**
 * The four states FormPilot paints onto a live form, and the marks it uses to
 * name them.
 *
 * These are the product's own vocabulary, so every surface that reports a fill
 * must use the same ones: the in-page result bubble, the popup summary, and
 * anything added later. The values are CSS variables, not literals — the
 * palette lives in DESIGN.md's token files (lib/ui/page-tokens.css for pages,
 * lib/ui/inject-css.ts for shadow UI), and a status colour must flip with the
 * same prefers-color-scheme as everything else.
 */
export const STATUS_COLORS: Record<FillStatus, string> = {
  filled: 'var(--fp-filled)',
  uncertain: 'var(--fp-uncertain)',
  empty: 'var(--fp-empty)',
  unrecognized: 'var(--fp-unrecognized)',
};

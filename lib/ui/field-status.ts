import type { FillStatus } from '@/lib/engine/adapters/types';

/**
 * The four states FormPilot paints onto a live form, and the marks it uses to
 * name them.
 *
 * These are the product's own vocabulary, so every surface that reports a fill
 * must use the same ones: the in-page result bubble, the popup summary, and
 * anything added later. They lived only inside ResultBubble before, which meant
 * the popup was free to invent its own colours for the same three numbers —
 * and did.
 */
export const STATUS_COLORS: Record<FillStatus, string> = {
  filled: '#4ade80',
  uncertain: '#facc15',
  empty: '#60a5fa',
  unrecognized: '#f87171',
};

export const STATUS_ICONS: Record<FillStatus, string> = {
  filled: '✅',
  uncertain: '⚠️',
  empty: '📝',
  unrecognized: '❌',
};

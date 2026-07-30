import { matchField } from './heuristic/engine';

export interface ProbeOptions {
  /** Stop as soon as this many distinct resume paths are found. */
  target?: number;
  /** Hard ceiling on how many elements are examined. */
  maxElements?: number;
}

const DEFAULT_TARGET = 5;
const DEFAULT_MAX_ELEMENTS = 300;

/** Input types that never carry user data worth matching. */
const SKIPPED_INPUT_TYPES = ['hidden', 'submit', 'reset', 'button', 'image'];

/**
 * Count the distinct resumePaths recognisable on a page.
 *
 * Read-only: performs no DOM writes, no storage reads, and no IPC. It answers
 * "is this page asking for resume information?" using only the page's own
 * labels and attributes — never the user's stored data — so a brand-new user
 * with an empty profile gets the same answer as a fully populated one.
 *
 * Bounded on both axes: short-circuits at `target` (a real application form
 * exits after roughly a dozen elements) and never examines more than
 * `maxElements` (so pages built from hundreds of contenteditable nodes cannot
 * stall the main thread).
 */
export function probeResumeFields(doc: Document, opts?: ProbeOptions): number {
  const target = opts?.target ?? DEFAULT_TARGET;
  const maxElements = opts?.maxElements ?? DEFAULT_MAX_ELEMENTS;

  const elements = doc.querySelectorAll<HTMLElement>(
    'input, select, textarea, [contenteditable]:not([contenteditable="false"])',
  );

  const paths = new Set<string>();
  let examined = 0;

  for (const el of elements) {
    if (examined >= maxElements) break;

    if (el.tagName.toLowerCase() === 'input') {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (SKIPPED_INPUT_TYPES.includes(type)) continue;
    }

    examined += 1;

    // Mirror scanner.ts: a detached or malformed element must not abort the
    // whole probe.
    let m: ReturnType<typeof matchField> = null;
    try {
      m = matchField(el);
    } catch {
      continue;
    }

    if (!m || m.confidence < 0.5 || !m.resumePath) continue;

    paths.add(m.resumePath);
    if (paths.size >= target) return paths.size;
  }

  return paths.size;
}

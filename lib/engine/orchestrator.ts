import type { PlatformAdapter, FillResult, FillResultItem } from './adapters/types';
import type { Resume } from '@/lib/storage/types';
import { matchField } from './heuristic/engine';
import { fillElement } from './heuristic/fillers';

// ─── Resume Path Resolver ─────────────────────────────────────────────────────

/**
 * Resolve a dotted resume path to a string value.
 *
 * - 'basic.name'              → resume.basic.name
 * - 'education.school'        → resume.education[0].school (first entry)
 * - 'education[1].school'     → resume.education[1].school (explicit index)
 * - 'work.company'            → resume.work[0].company
 * - 'basic.socialLinks.github'→ resume.basic.socialLinks['github']
 * - Array values are joined with ', '
 */
export function getValueFromResume(resume: Resume, path: string): string {
  // Handle indexed paths like "education[1].school"
  const indexMatch = path.match(/^(\w+)\[(\d+)\]\.(.+)$/);
  if (indexMatch) {
    const [, section, indexStr, field] = indexMatch;
    const arr = resume[section as keyof Resume];
    if (Array.isArray(arr)) {
      const entry = arr[parseInt(indexStr, 10)];
      if (entry) return String((entry as Record<string, unknown>)[field] ?? '');
    }
    return '';
  }

  // Handle unindexed paths (existing logic)
  const parts = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = resume;

  for (const part of parts) {
    if (cursor === null || cursor === undefined) return '';

    if (Array.isArray(cursor)) {
      // Use the first element of the array
      if (cursor.length === 0) return '';
      cursor = cursor[0];
    }

    cursor = cursor[part];
  }

  if (cursor === null || cursor === undefined) return '';
  if (Array.isArray(cursor)) return cursor.join(', ');
  return String(cursor);
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Fill a document's form fields using a cascade strategy:
 * 1. Platform adapter (if present) — exact field mappings
 * 2. Heuristic engine — confidence-based matching for remaining fields
 *
 * Returns a FillResult with counts and per-field status.
 */
export async function orchestrateFill(
  doc: Document,
  resume: Resume,
  adapter: PlatformAdapter | null,
): Promise<FillResult> {
  const items: FillResultItem[] = [];
  const handledElements = new Set<Element>();

  // ── Phase 1: Adapter ───────────────────────────────────────────────────────
  if (adapter) {
    const mappings = adapter.scan(doc);

    for (const mapping of mappings) {
      const value = getValueFromResume(resume, mapping.resumePath);

      let filled = false;
      if (value) {
        try {
          filled = await adapter.fill(mapping.element, value, mapping.inputType);
        } catch {
          filled = false;
        }
      }

      handledElements.add(mapping.element);

      items.push({
        element: mapping.element,
        resumePath: mapping.resumePath,
        label: mapping.label,
        status: filled ? 'filled' : 'unrecognized',
        confidence: mapping.confidence,
        source: 'adapter',
      });
    }
  }

  // ── Phase 2: Heuristic fallback for remaining inputs ──────────────────────
  const inputs = doc.querySelectorAll('input, select, textarea');

  for (const el of inputs) {
    if (handledElements.has(el)) continue;

    // Skip non-interactive input types
    if (el.tagName.toLowerCase() === 'input') {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (['hidden', 'submit', 'reset', 'button', 'image'].includes(type)) continue;
    }

    const mapping = matchField(el);

    if (!mapping || mapping.confidence < 0.5) {
      // Unrecognized
      const label =
        el.getAttribute('aria-label') ??
        el.getAttribute('placeholder') ??
        el.getAttribute('name') ??
        el.getAttribute('id') ??
        '';

      items.push({
        element: el,
        resumePath: '',
        label,
        status: 'unrecognized',
        confidence: mapping?.confidence ?? 0,
        source: 'heuristic',
      });
      continue;
    }

    const value = getValueFromResume(resume, mapping.resumePath);
    let filled = false;

    if (value) {
      try {
        filled = await fillElement(el, value, mapping.inputType);
      } catch {
        filled = false;
      }
    }

    let status: FillResultItem['status'];
    if (!filled) {
      status = 'unrecognized';
    } else if (mapping.confidence >= 0.8) {
      status = 'filled';
    } else {
      status = 'uncertain';
    }

    items.push({
      element: el,
      resumePath: mapping.resumePath,
      label: mapping.label,
      status,
      confidence: mapping.confidence,
      source: 'heuristic',
    });
  }

  // ── Tally counts ──────────────────────────────────────────────────────────
  const filled = items.filter((i) => i.status === 'filled').length;
  const uncertain = items.filter((i) => i.status === 'uncertain').length;
  const unrecognized = items.filter((i) => i.status === 'unrecognized').length;

  return { items, filled, uncertain, unrecognized };
}

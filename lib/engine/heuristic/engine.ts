import type { FieldMapping } from '@/lib/engine/adapters/types';
import { extractSignals } from './signals';
import { PATTERNS } from './patterns';

// ─── Signal Weights ───────────────────────────────────────────────────────────

const SIGNAL_WEIGHTS: Record<string, number> = {
  nameAttr: 0.95,
  idAttr: 0.85,
  labelText: 0.9,
  ariaLabel: 0.85,
  placeholder: 0.8,
  title: 0.7,
  surroundingText: 0.6,
};

// Ordered list of signal keys to check (higher weight first)
const SIGNAL_ORDER = [
  'nameAttr',
  'labelText',
  'idAttr',
  'ariaLabel',
  'placeholder',
  'title',
  'surroundingText',
] as const;

type SignalKey = (typeof SIGNAL_ORDER)[number];

/**
 * Test a single signal value against all patterns in the PATTERNS map.
 * Returns an array of { resumePath, confidence } for each match found.
 */
function testSignalAgainstPatterns(
  signalValue: string,
  signalWeight: number
): Array<{ resumePath: string; confidence: number }> {
  const results: Array<{ resumePath: string; confidence: number }> = [];
  for (const [resumePath, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(signalValue)) {
        results.push({ resumePath, confidence: signalWeight });
        break; // Only one match per path per signal
      }
    }
  }
  return results;
}

/**
 * Match a single form element to a resume field using heuristic signals.
 * Returns the best FieldMapping, or null if no pattern matched.
 */
export function matchField(element: Element): FieldMapping | null {
  const signals = extractSignals(element);

  // Track best match per resumePath across all signals
  const bestByPath = new Map<string, number>();

  for (const key of SIGNAL_ORDER) {
    const value = signals[key as SignalKey];
    if (!value) continue;

    const weight = SIGNAL_WEIGHTS[key];
    const matches = testSignalAgainstPatterns(value, weight);

    for (const { resumePath, confidence } of matches) {
      const existing = bestByPath.get(resumePath) ?? 0;
      if (confidence > existing) {
        bestByPath.set(resumePath, confidence);
      }
    }
  }

  if (bestByPath.size === 0) return null;

  // Find the highest confidence match
  let bestPath = '';
  let bestConfidence = 0;
  for (const [path, conf] of bestByPath) {
    if (conf > bestConfidence) {
      bestConfidence = conf;
      bestPath = path;
    }
  }

  // Derive a label from the best available signal text
  const label =
    signals.labelText ??
    signals.ariaLabel ??
    signals.placeholder ??
    signals.nameAttr ??
    signals.idAttr ??
    bestPath;

  return {
    element,
    resumePath: bestPath,
    label,
    inputType: signals.inputType,
    confidence: bestConfidence,
    source: 'heuristic',
  };
}

/**
 * Scan a root element (form or document) and return all recognized field mappings.
 */
export function scanForm(root: Element | Document): FieldMapping[] {
  const elements = root.querySelectorAll('input, select, textarea');
  const mappings: FieldMapping[] = [];

  for (const el of elements) {
    // Skip hidden, submit, reset, button inputs
    if (el.tagName.toLowerCase() === 'input') {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (['hidden', 'submit', 'reset', 'button', 'image'].includes(type)) {
        continue;
      }
    }

    const mapping = matchField(el);
    if (mapping) {
      mappings.push(mapping);
    }
  }

  return mappings;
}

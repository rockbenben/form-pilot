// lib/capture/types.ts
export type CapturedFieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'contenteditable';

export interface CapturedField {
  /** Stable CSS selector: prefers `#id`, else tag[type]:nth-of-type(n) path. */
  selector: string;
  /**
   * Ordinal (0-based) of this field within the set of fields sharing the same
   * signature, in DOM order. Used as the fallback key when selector fails to
   * resolve, and as the primary key for page-memory matching across visits.
   */
  index: number;
  kind: CapturedFieldKind;
  /** select/radio: selected option value; checkbox: 'true' | 'false'; else: raw value */
  value: string;
  /**
   * User-visible option text for radio/select. For cross-URL form-entry matching
   * the internal `value` (often a numeric index) doesn't survive; the option
   * label ("男" / "汉族") does. Undefined for text/checkbox where `value`
   * already carries the visible content.
   */
  displayValue?: string;
  /** hash of (label | name | placeholder | aria-label) */
  signature: string;
  /** Human-readable label for display (not used for matching). */
  label: string;
}

export interface DraftSnapshot {
  url: string;
  savedAt: number; // Unix ms
  fields: CapturedField[];
}

export interface PageMemoryEntry {
  signature: string;
  index: number;       // ordinal within same-signature group, in page DOM order
  kind: CapturedFieldKind;
  value: string;
  updatedAt: number;
}

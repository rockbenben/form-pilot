export type InputType =
  | 'text'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'textarea'
  | 'custom-select'
  | 'contenteditable';

export type FillSource = 'adapter' | 'heuristic' | 'ai' | 'memory' | 'form';
/**
 * - `filled`        value written, high confidence
 * - `uncertain`     value written, but matched on a weaker signal
 * - `empty`         field WAS recognized as a resume field, but the profile /
 *                   memory had nothing to put in it. The user fixes this by
 *                   completing their profile — it is not a matching failure.
 * - `unrecognized`  either no resume field matched, or one matched and the
 *                   write itself failed (read-only input, exotic widget).
 *                   Nothing the user can do from their profile.
 *
 * `empty` exists because collapsing it into `unrecognized` made a blank
 * profile look identical to a broken matcher — the toolbar reported "❌ 姓名"
 * for a field it had recognized perfectly well.
 */
export type FillStatus = 'filled' | 'uncertain' | 'empty' | 'unrecognized';

export interface FieldMapping {
  element: Element;
  resumePath: string;
  label: string;
  inputType: InputType;
  confidence: number;
  source: FillSource;
}

export interface FillResultItem {
  element?: Element;  // reference to the actual DOM element
  resumePath: string;
  label: string;
  status: FillStatus;
  confidence: number;
  source: FillSource;
}

export interface FillResult {
  items: FillResultItem[];
  filled: number;
  uncertain: number;
  /** Recognized resume fields the profile had no value for. */
  empty: number;
  unrecognized: number;
  /** Phase 4 candidate selections — one per successfully filled field. Present only when at least one Phase 4 fill succeeded. */
  formHits?: Array<{ signature: string; candidateId: string }>;
  /** Phase 2 profile candidate selections — one per profile field filled from a multi-candidate array. */
  profileHits?: Array<{ resumePath: string; candidateId: string }>;
}

export interface StepInfo {
  index: number;
  total: number;
  label: string;
  isActive: boolean;
}

export interface PlatformAdapter {
  id: string;
  matchUrl: RegExp | RegExp[];
  version: string;
  scan(doc: Document): FieldMapping[];
  fill(element: Element, value: string, fieldType: InputType): Promise<boolean>;
  getFormSteps?(): StepInfo[];
  nextStep?(): Promise<void>;
}

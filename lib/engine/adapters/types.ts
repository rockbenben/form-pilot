export type InputType =
  | 'text'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'textarea'
  | 'custom-select';

export type FillSource = 'adapter' | 'heuristic' | 'ai';
export type FillStatus = 'filled' | 'uncertain' | 'unrecognized';

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
  unrecognized: number;
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

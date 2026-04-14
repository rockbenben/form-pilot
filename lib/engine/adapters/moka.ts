import type { PlatformAdapter, FieldMapping, InputType, StepInfo } from './types';
import { fillElement } from '@/lib/engine/heuristic/fillers';

// ─── Field Map ────────────────────────────────────────────────────────────────

/**
 * Maps Moka field label keywords (lowercase) to resume dot-paths.
 */
const MOKA_FIELD_MAP: Record<string, string> = {
  name: 'basic.name',
  姓名: 'basic.name',
  mobile: 'basic.phone',
  手机: 'basic.phone',
  phone: 'basic.phone',
  email: 'basic.email',
  邮箱: 'basic.email',
  gender: 'basic.gender',
  性别: 'basic.gender',
  birth: 'basic.birthday',
  出生日期: 'basic.birthday',
  nation: 'basic.ethnicity',
  民族: 'basic.ethnicity',
  political: 'basic.politicalStatus',
  政治面貌: 'basic.politicalStatus',
  school_name: 'education.school',
  学校: 'education.school',
  education: 'education.degree',
  学历: 'education.degree',
  major: 'education.major',
  专业: 'education.major',
  gpa: 'education.gpa',
  绩点: 'education.gpa',
  company: 'work.company',
  公司: 'work.company',
  job_title: 'work.title',
  职位: 'work.title',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Detect the InputType of an element.
 */
function detectInputType(el: Element): InputType {
  const tag = el.tagName.toLowerCase();
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'textarea';
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'date' || type === 'datetime-local' || type === 'month') return 'date';
  }
  // Detect custom-select by class
  const cls = el.className ?? '';
  if (typeof cls === 'string' && /custom[\s_-]?select|moka[\s_-]?select/i.test(cls)) {
    return 'custom-select';
  }
  return 'text';
}

/**
 * Extract a human-readable label from a Moka form-item container.
 */
function extractLabel(container: Element): string {
  // Try explicit label element first
  const labelEl = container.querySelector('label');
  if (labelEl) {
    const clone = labelEl.cloneNode(true) as Element;
    clone.querySelectorAll('input, select, textarea, span.required').forEach((c) => c.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }
  // Fall back to any element with 'label' in class
  const classLabel = container.querySelector('[class*="label"]');
  if (classLabel) return classLabel.textContent?.trim() ?? '';
  return '';
}

/**
 * Match a label string against the MOKA_FIELD_MAP.
 * Checks both exact and keyword-substring matches (case-insensitive).
 */
function matchLabel(label: string): string | null {
  const lower = label.toLowerCase().trim();
  // Exact match
  if (MOKA_FIELD_MAP[lower]) return MOKA_FIELD_MAP[lower];

  // Keyword match
  for (const [keyword, path] of Object.entries(MOKA_FIELD_MAP)) {
    if (lower.includes(keyword.toLowerCase())) return path;
  }
  return null;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const mokaAdapter: PlatformAdapter = {
  id: 'moka',
  version: '1.0.0',
  matchUrl: [/app\.mokahr\.com/i, /\.moka\.com/i],

  scan(doc: Document): FieldMapping[] {
    const containers = doc.querySelectorAll(
      '[class*="form-item"], [class*="field-item"], .form-group'
    );
    const mappings: FieldMapping[] = [];

    for (const container of containers) {
      const label = extractLabel(container);
      if (!label) continue;

      const resumePath = matchLabel(label);
      if (!resumePath) continue;

      // Find the interactive input element within the container
      const input =
        container.querySelector<Element>('input, select, textarea') ??
        container.querySelector<Element>('[class*="custom-select"], [class*="selector"]');

      if (!input) continue;

      mappings.push({
        element: input,
        resumePath,
        label,
        inputType: detectInputType(input),
        confidence: 1.0,
        source: 'adapter',
      });
    }

    return mappings;
  },

  async fill(element: Element, value: string, fieldType: InputType): Promise<boolean> {
    if (fieldType === 'custom-select') {
      // Click the trigger to open the dropdown overlay
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Allow the overlay time to render
      await new Promise((resolve) => setTimeout(resolve, 80));

      const doc = element.ownerDocument;
      if (!doc) return false;

      const lowerValue = value.toLowerCase();

      // Moka-specific overlay selectors, plus generic fallbacks
      const overlaySelectors = [
        '.moka-select-dropdown [class*="option"]',
        '.moka-dropdown-item',
        '[class*="select-dropdown"] [class*="option"]',
        '[class*="dropdown-option"]',
        '[role="listbox"] [role="option"]',
        '[role="option"]',
        '.el-select-dropdown__item',
        '.ant-select-item-option',
      ];

      for (const selector of overlaySelectors) {
        const options = Array.from(doc.querySelectorAll(selector));
        if (options.length === 0) continue;

        const match = options.find(
          (opt) =>
            opt.textContent?.trim().toLowerCase() === lowerValue ||
            opt.textContent?.trim().toLowerCase().includes(lowerValue)
        );

        if (match) {
          match.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return true;
        }
      }

      return false;
    }

    // Delegate all other types to the shared filler
    return fillElement(element, value, fieldType);
  },

  getFormSteps(): StepInfo[] {
    const doc =
      typeof document !== 'undefined' ? document : null;
    if (!doc) return [];

    const stepEls = doc.querySelectorAll('[class*="step"], [class*="wizard-item"]');
    if (stepEls.length === 0) return [];

    return Array.from(stepEls).map((el, index) => ({
      index,
      total: stepEls.length,
      label: el.textContent?.trim() ?? `Step ${index + 1}`,
      isActive:
        el.classList.contains('active') ||
        el.getAttribute('aria-current') === 'step' ||
        el.getAttribute('data-active') === 'true',
    }));
  },

  async nextStep(): Promise<void> {
    const doc =
      typeof document !== 'undefined' ? document : null;
    if (!doc) return;

    // Look for a "next" button by common patterns
    const nextBtn = doc.querySelector<HTMLElement>(
      '[class*="next-btn"], [class*="btn-next"], button[class*="next"]'
    );
    if (nextBtn) {
      nextBtn.click();
      return;
    }

    // Fallback: find a button whose text contains "下一步" or "Next"
    const buttons = Array.from(doc.querySelectorAll<HTMLElement>('button'));
    const fallback = buttons.find((b) =>
      /下一步|next/i.test(b.textContent?.trim() ?? '')
    );
    fallback?.click();
  },
};

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
/**
 * Wordings that describe how a form *behaves* rather than what it holds.
 *
 * These sit right next to the fields they govern and share their vocabulary,
 * so the pattern table grabs them: 猎聘's privacy checkbox 「薪资显示为保密」
 * matched `jobPreference.salaryRange` on the bare 薪资, which meant a fill
 * would tick a box that hides the user's salary from recruiters. A wrong value
 * in a text field is visible and correctable; a silently flipped privacy
 * setting is neither.
 */
const CONTROL_WORDING_RE =
  /显示为|设为|是否|有无|保密|隐藏|屏蔽|不公开|仅对|公开范围|同意|已阅读|接收.*(通知|推送)|订阅|记住我|自动登录|^(本段|该段|此段|本条|该条|本经历|该经历)/;

/**
 * A site-wide search box, not a form field.
 *
 * 智联招聘's header carries 「搜索职位、公司」, which matched `work.company` on
 * the 公司 — a fill would have typed the user's employer into the site search.
 * The giveaway is the list: a header search covers several things at once,
 * while a field's own picker searches exactly one (「搜索职位类别」,
 * 「搜索城市名/区县」), so only a comma-separated list counts as a search box.
 */
const SEARCH_BOX_RE = /^\s*搜索[^、，,]*[、，,]/;

/**
 * Wordings that name a date *group* — which kind of entry the range belongs to,
 * without saying which end it is.
 *
 * Boards label both halves of a range with one shared string and put the
 * start/end distinction in each input's own placeholder: 智联 renders
 * 「在职时间」 above 入职时间 and 离职时间, 「项目时间」 above 选择开始时间 and
 * 选择结束时间, 「在校时间」 above 入学时间 and 毕业时间.
 */
const DATE_GROUP: Array<[RegExp, string]> = [
  [/在职时间|任职时间|任职期间|工作起止/, 'work'],
  [/项目时间|项目起止/, 'projects'],
  [/在校时间|就读时间|教育时间|学习时间/, 'education'],
];

/** Wordings that name which END of a range an input holds. */
const RANGE_START = /入职时间|入学时间|开始时间|起始时间|开始日期|起始日期|选择开始|from/i;
const RANGE_END = /离职时间|毕业时间|结束时间|终止时间|结束日期|选择结束|至今|to$/i;

/**
 * Resolve a date-range input by combining two signals that answer different
 * questions: the shared label says which entry the range belongs to, the
 * input's own placeholder says which end it is.
 *
 * The generic path cannot do this. It has every signal compete for one answer
 * and weights them by signal *type*, so a label always outranks a placeholder
 * — and on 智联 both halves of 「在职时间」 therefore resolved to
 * `work.startDate`, quietly filling a job's end date with its start date.
 *
 * Returns null when either half is missing, leaving the generic path in charge.
 */
function resolveDateRange(signals: ReturnType<typeof extractSignals>): string | null {
  const groupText = [signals.labelText, signals.ariaLabel, signals.title]
    .filter((v): v is string => !!v)
    .find((v) => DATE_GROUP.some(([re]) => re.test(v)));
  if (!groupText) return null;

  const entity = DATE_GROUP.find(([re]) => re.test(groupText))![1];

  // A group label on a checkbox is the 「至今」 / 「至今在读」 toggle, not a date.
  // It has no placeholder to disambiguate, so the generic path would match the
  // group wording and tick it.
  if (signals.inputType === 'checkbox' || signals.inputType === 'radio') return null;

  const endText = [signals.placeholder, signals.title, signals.ariaLabel]
    .filter((v): v is string => !!v)
    .find((v) => RANGE_END.test(v) || RANGE_START.test(v));

  // A lone text input under a group label, with nothing saying which end it is,
  // takes the start. That is the conventional single value for a period, and it
  // keeps boards that have not been surveyed working — the checkbox case, the
  // one shape where this would be wrong, was already rejected above.
  if (!endText) return `${entity}.startDate`;

  // End is checked first: 「离职时间」 contains 时间, which several start
  // wordings also do, and only the end wordings are unambiguous.
  return `${entity}.${RANGE_END.test(endText) ? 'endDate' : 'startDate'}`;
}

export function matchField(element: Element): FieldMapping | null {
  const signals = extractSignals(element);

  // Checked across the identifying signals, not the element type: the same
  // wording appears on checkboxes, switches and radios alike.
  for (const key of ['labelText', 'ariaLabel', 'placeholder', 'title'] as const) {
    const v = signals[key];
    if (v && (CONTROL_WORDING_RE.test(v) || SEARCH_BOX_RE.test(v))) return null;
  }

  // A date group needs both signals read together, so it is resolved before the
  // generic single-answer competition.
  const groupLabel = [signals.labelText, signals.ariaLabel, signals.title].some(
    (v) => v && DATE_GROUP.some(([re]) => re.test(v)),
  );
  if (groupLabel) {
    const path = resolveDateRange(signals);
    if (!path) return null;   // the range's 至今 toggle, or an end we cannot name
    return {
      element,
      resumePath: path,
      label: signals.labelText ?? signals.placeholder ?? path,
      inputType: signals.inputType,
      confidence: 0.9,
      source: 'heuristic',
    };
  }

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

  return rehomeAmbiguousDates(mappings);
}

// ─── Ambiguous date re-homing ─────────────────────────────────────────────────

/** A range wording that names an end but not what the range belongs to. */
const BARE_RANGE_START = /^(开始|起始)(时间|日期)$|^选择开始时间$|^start[\s_-]?date$/i;
const BARE_RANGE_END = /^(结束|终止)(时间|日期)$|^选择结束时间$|^end[\s_-]?date$/i;

/**
 * Is this field a date whose entity nobody stated?
 *
 * 猎聘's editors label none of their date inputs. Each modal — work, project
 * and education alike — shows the same bare 「开始时间」/「结束时间」 placeholder,
 * so the pattern table has to guess an entity and picks whichever path declares
 * the wording first. That put a job's dates under `education`, which means a
 * fill types the user's school dates into their work history.
 */
const ENTITY_DATE_RE =
  /入职|离职|到职|任职|入学|毕业|离校|在校|在职|项目(开始|结束|时间)|参加工作/;

function bareDateEnd(el: Element): 'startDate' | 'endDate' | null {
  const s = extractSignals(el);
  const texts = [s.labelText, s.placeholder, s.ariaLabel, s.title].filter(
    (v): v is string => !!v,
  );
  // Any signal naming an entity settles it — this field is not ambiguous and
  // must keep the path its own wording earned.
  if (texts.some((t) => ENTITY_DATE_RE.test(t) || DATE_GROUP.some(([re]) => re.test(t)))) {
    return null;
  }
  // Signals that match nothing are ignored rather than disqualifying: 猎聘 puts
  // the input's current VALUE in `title`, so requiring every signal to be a
  // range wording meant no field ever qualified.
  for (const t of texts) {
    if (BARE_RANGE_END.test(t)) return 'endDate';
    if (BARE_RANGE_START.test(t)) return 'startDate';
  }
  return null;
}

/** Nearest ancestor that groups a single entry's fields. */
function entryContainer(el: Element): Element {
  return (
    el.closest('form, [role=dialog], .ant-modal, fieldset, section') ??
    el.parentElement ??
    el
  );
}

/**
 * Give every entity-less date the entity its neighbours already proved.
 *
 * Runs over a whole scan rather than per element, because the evidence is the
 * other fields in the same container: a bare 「开始时间」 sitting beside a field
 * that matched `work.description` is a work date, and nothing about that input
 * alone could say so. Only fields whose own signals are entirely bare range
 * wordings are touched, and only when exactly one entity is present — an
 * ambiguous container is left as it was rather than guessed at.
 */
export function rehomeAmbiguousDates(mappings: FieldMapping[]): FieldMapping[] {
  const ambiguous = mappings
    .map((m, i) => ({ i, end: bareDateEnd(m.element) }))
    .filter((x): x is { i: number; end: 'startDate' | 'endDate' } => x.end !== null);
  if (ambiguous.length === 0) return mappings;

  const ENTITIES = ['work', 'projects', 'education'] as const;
  const out = [...mappings];

  for (const { i, end } of ambiguous) {
    const container = entryContainer(out[i].element);
    const present = new Map<string, number>();
    for (const other of mappings) {
      if (other.element === out[i].element) continue;
      if (!container.contains(other.element)) continue;
      if (bareDateEnd(other.element)) continue;   // another ambiguous date proves nothing
      const entity = other.resumePath.split('.')[0];
      if ((ENTITIES as readonly string[]).includes(entity)) {
        present.set(entity, (present.get(entity) ?? 0) + 1);
      }
    }
    // The entity with the most fields in this container wins. 猎聘's project
    // modal legitimately carries a 「公司名称」 field, so requiring a single
    // entity meant the project's own dates were never re-homed. A tie is left
    // alone rather than guessed at.
    let best = '';
    let bestN = 0;
    let tied = false;
    for (const [entity, n] of present) {
      if (n > bestN) { best = entity; bestN = n; tied = false; }
      else if (n === bestN) tied = true;
    }
    if (!best || tied) continue;
    out[i] = { ...out[i], resumePath: `${best}.${end}` };
  }
  return out;
}

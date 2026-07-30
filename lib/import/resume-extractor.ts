import { type Resume, createEmptyResume } from '@/lib/storage/types';

// ─── Skill dictionaries ───────────────────────────────────────────────────────

const LANGUAGE_SKILLS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust',
  'Ruby', 'Swift', 'Kotlin', 'PHP', 'HTML', 'CSS', 'SQL', 'R', 'Scala',
  'Perl', 'Bash', 'Shell', 'Dart', 'Lua', 'MATLAB',
];

const FRAMEWORK_SKILLS = [
  'React', 'Vue', 'Angular', 'Node.js', 'Express', 'Next.js', 'Nuxt',
  'Django', 'Flask', 'FastAPI', 'Spring', 'Spring Boot', 'Laravel',
  'Rails', 'Svelte', 'jQuery', 'Redux', 'GraphQL', 'NestJS', 'Koa',
  'Tailwind', 'Bootstrap', 'Material UI', 'Ant Design',
];

const TOOL_SKILLS = [
  'Git', 'Docker', 'Kubernetes', 'Jenkins', 'GitHub', 'GitLab', 'Nginx',
  'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Kafka',
  'AWS', 'GCP', 'Azure', 'Linux', 'Webpack', 'Vite', 'Figma', 'Jira',
  'Postman', 'VS Code', 'IntelliJ', 'Xcode', 'Android Studio',
];

// ─── Education section headers ────────────────────────────────────────────────

const EDU_SECTION_RE = /教育经历|教育背景|学历信息|education/i;
const SECTION_END_RE = /工作经历|实习经历|项目经历|技能|自我评价|个人信息|证书|work\s*experience|skills|projects/i;

// ─── School name detection ────────────────────────────────────────────────────

/**
 * Schools are matched by shape, not by name.
 *
 * This used to be a hand-written list of 28 universities, which meant that
 * anyone who did not attend one of them imported with an empty school field —
 * and no list can ever be finished. Chinese institution names end in a small,
 * stable set of suffixes, so matching the suffix and taking the preceding
 * characters generalises to every school without maintenance.
 */
const KNOWN_SCHOOLS_RE =
  /[一-龥]{2,12}?(?:大学|学院|职业技术学校|职业技术学院|高等专科学校|专科学校|中学|高中|附中|党校|研究生院)|[A-Z][A-Za-z.'-]*(?:\s+(?:of|and|the))?(?:\s+[A-Z][A-Za-z.'-]*)*\s+(?:University|College|Institute|Academy|School)|University\s+of\s+[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*/;

// ─── Degree keywords ──────────────────────────────────────────────────────────

const DEGREE_RE = /博士|硕士|本科|大专|学士|PhD|Master|Bachelor|Associate/i;

// ─── Main extractor ───────────────────────────────────────────────────────────

export interface ExtractedResume {
  basic: {
    name: string;
    email: string;
    phone: string;
    gender: string;
    /** YYYY-MM or YYYY-MM-DD */
    birthday: string;
    location: string;
    ethnicity: string;
    politicalStatus: string;
    workStartDate: string;
    currentSalary: string;
    jobStatus: string;
    wechat: string;
  };
  education: Array<{
    school: string;
    degree: string;
    major: string;
    gpa: string;
    startDate: string;
    endDate: string;
  }>;
  work: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;
  projects: Array<{
    name: string;
    role: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;
  jobPreference: {
    positions: string[];
    salaryRange: string;
    cities: string[];
  };
  skills: {
    languages: string[];
    tools: string[];
  };
}

export function extractResumeFields(text: string): ExtractedResume {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const email = extractEmail(text);
  const phone = extractPhone(text);
  const name = extractName(lines, email, phone);
  const labelled = extractLabelledFields(lines);
  const education = extractEducation(text, lines);
  const { work, projects } = extractExperience(lines);
  const skills = extractSkills(text);

  return {
    basic: {
      name,
      email,
      phone,
      // The label scan is authoritative when the resume spells a field out;
      // the header line is the fallback for the compact
      // 「name 男 · 32 岁 · 杭州 · 本科」 style that carries no labels at all.
      gender: labelled.gender || extractGenderFromHeader(lines),
      birthday: labelled.birthday || extractBirthday(lines),
      location: labelled.location,
      ethnicity: labelled.ethnicity,
      politicalStatus: labelled.politicalStatus,
      workStartDate: labelled.workStartDate,
      currentSalary: labelled.currentSalary,
      jobStatus: labelled.jobStatus,
      wechat: labelled.wechat,
    },
    education,
    work,
    projects,
    jobPreference: {
      positions: splitMultiValue(labelled.positions),
      salaryRange: labelled.salaryRange,
      cities: splitMultiValue(labelled.cities),
    },
    skills,
  };
}

// ─── Email ────────────────────────────────────────────────────────────────────

function extractEmail(text: string): string {
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  return match ? match[0] : '';
}

// ─── Phone ────────────────────────────────────────────────────────────────────

function extractPhone(text: string): string {
  // Chinese mobile: 1[3-9]xx xxxx xxxx (with optional dashes/spaces)
  const cnMatch = text.match(/1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/);
  if (cnMatch) return cnMatch[0];

  // International: +1-555-123-4567 or similar
  const intlMatch = text.match(/\+?\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3}[\s-]?\d{3,4}[\s-]?\d{0,4}/);
  if (intlMatch) return intlMatch[0].trim();

  return '';
}

// ─── Name ─────────────────────────────────────────────────────────────────────

// Lines that are clearly not a name
const NOT_NAME_RE = /[@.]/; // contains email / url chars
const HEADER_KEYWORDS_RE = /简历|resume|cv|联系|教育|工作|技能|项目|自我|基本信息|个人|profile/i;

function looksLikeName(line: string): boolean {
  if (!line) return false;
  if (line.length > 20) return false;
  if (NOT_NAME_RE.test(line)) return false;
  if (HEADER_KEYWORDS_RE.test(line)) return false;
  // Must be mostly letters (Chinese or Latin)
  if (!/[\u4e00-\u9fa5a-zA-Z]/.test(line)) return false;
  return true;
}

/**
 * A Chinese resume opens with the name, very often followed on the SAME line by
 * gender, age, city and degree separated by spaces, pipes or middots. Requiring
 * the name to be alone on a short line meant those headers were skipped and the
 * scan carried on until it hit something else short — in one real resume that
 * was the IM handle two lines further down, so the profile imported under the
 * wrong name. Matching the leading Han run is what a human reader does.
 */
const CJK_NAME_HEAD = /^([一-龥]{2,4})(?=[\s|｜·・,，、/]|$)/;

/**
 * Section headings are 2-4 Han characters at the start of a line too, so the
 * head match alone would happily return 「优势亮点」. Screening the whole line
 * against the header keywords instead does not work: a real name line reads
 * 「张明远 男 · 32 岁 · 工作 9 年」 and would be thrown away for containing
 * 「工作」. The token itself is what must be checked.
 */
const CJK_SECTION_HEADING =
  /^(优势亮点|个人优势|个人简介|个人信息|基本信息|自我评价|自我介绍|求职意向|求职期望|工作经历|工作经验|教育经历|教育背景|项目经历|项目经验|专业技能|技能证书|技能特长|联系方式|证书奖项|荣誉奖项|所获奖项|获奖情况|培训经历|语言能力|兴趣爱好|实习经历|校园经历)$/;

/** A name lives at the top of a resume; scanning the whole document invites
 *  false positives from body copy. */
const NAME_SEARCH_LINES = 15;

function extractName(lines: string[], email: string, phone: string): string {
  const candidates = lines.slice(0, NAME_SEARCH_LINES).filter((line) => {
    if (email && line.includes(email)) return false;
    if (phone && line.includes(phone)) return false;
    return true;
  });

  for (const line of candidates) {
    const m = line.match(CJK_NAME_HEAD);
    if (m && !CJK_SECTION_HEADING.test(m[1]) && !HEADER_KEYWORDS_RE.test(m[1])) return m[1];
  }

  // Latin names. Capitalisation is required so a lowercase handle — a username,
  // an IM id, a GitHub slug — is not mistaken for a name, and digits disqualify
  // the line outright.
  for (const line of candidates) {
    if (!looksLikeName(line)) continue;
    if (!/^[A-Z]/.test(line) || /\d/.test(line)) continue;
    return line;
  }

  return '';
}

// ─── Label-value fields ───────────────────────────────────────────────────────

/**
 * Chinese resumes state most of their structured facts as 「标签：值」, either
 * inline (`求职意向：产品经理 | 期望薪资：45-60K`) or with the value wrapped onto
 * the next line, which is what board-exported HTML does. Both shapes are common
 * enough in real files that supporting only one leaves most fields empty.
 */
const LABEL_MAP: Array<[RegExp, keyof LabelledFields]> = [
  [/^(现居住地|现居地|现居|所在城市|所在地|居住地|居住城市|工作城市|城市)$/, 'location'],
  [/^(性别)$/, 'gender'],
  [/^(出生日期|出生年月|出生|生日)$/, 'birthday'],
  [/^(民族)$/, 'ethnicity'],
  [/^(政治面貌)$/, 'politicalStatus'],
  [/^(求职意向|求职意向岗位|期望职位|期望岗位|意向岗位|意向职位|目标职位|应聘职位|期望从事职业)$/, 'positions'],
  [/^(期望薪资|期望月薪|期望年薪|薪资要求|目标薪资|薪资期望)$/, 'salaryRange'],
  [/^(期望城市|期望工作地区|期望工作城市|期望地区|意向城市|期望地点)$/, 'cities'],
  [/^(参加工作时间|参加工作年月|首次工作时间|开始工作时间)$/, 'workStartDate'],
  // Narrow for the same reason the matcher's pattern is: 期望月薪 must not be
  // read as the current one.
  [/^(当前薪资|目前薪资|现薪资|当前月薪|目前月薪|税前月薪|目前年薪|当前年薪)$/, 'currentSalary'],
  [/^(目前状态|求职状态|工作状态|在职状态|求职情况)$/, 'jobStatus'],
  [/^(微信|微信号|weixin|wechat)$/i, 'wechat'],
];

interface LabelledFields {
  location: string;
  gender: string;
  birthday: string;
  ethnicity: string;
  politicalStatus: string;
  positions: string;
  salaryRange: string;
  cities: string;
  workStartDate: string;
  currentSalary: string;
  jobStatus: string;
  wechat: string;
}

function extractLabelledFields(lines: string[]): LabelledFields {
  const out: LabelledFields = {
    location: '', gender: '', birthday: '', ethnicity: '',
    politicalStatus: '', positions: '', salaryRange: '', cities: '',
    workStartDate: '', currentSalary: '', jobStatus: '', wechat: '',
  };

  for (let i = 0; i < lines.length; i++) {
    // A single line can carry several labelled facts separated by pipes or
    // middots, so each segment is considered on its own.
    const segments = lines[i].split(/[|｜·・]/);
    for (const segment of segments) {
      const m = segment.match(/^\s*([^：:]{1,10})\s*[：:]\s*(.*)$/);
      if (!m) continue;
      const [, rawLabel, rawValue] = m;
      const label = rawLabel.trim();
      const entry = LABEL_MAP.find(([re]) => re.test(label));
      if (!entry) continue;
      const key = entry[1];
      if (out[key]) continue; // first occurrence wins

      let value = rawValue.trim();
      // `期望工作地区：` with the answer on the following line — only trust the
      // continuation when the label sat alone, otherwise a neighbouring
      // segment's text would be swallowed.
      if (!value && segments.length === 1 && i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (next && !/[：:]/.test(next) && next.length <= 40) value = next;
      }
      if (value) out[key] = value;
    }
  }

  return out;
}

/** `产品经理、运营总监` / `上海,杭州` → discrete values. */
function splitMultiValue(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[、,，;；/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

// ─── Gender / birthday from an unlabelled header ─────────────────────────────

/** The compact header style writes gender as a bare 男 / 女 among separators. */
function extractGenderFromHeader(lines: string[]): string {
  for (const line of lines.slice(0, NAME_SEARCH_LINES)) {
    const m = line.match(/(?:^|[\s|｜·・,，(（])([男女])(?=[\s|｜·・,，)）]|$)/);
    if (m) return m[1];
  }
  return '';
}

const DATE_YM_RE = /((?:19|20)\d{2})\s*[年./-]\s*(\d{1,2})(?:\s*[月./-]\s*(\d{1,2}))?/;

/**
 * Only an explicit date counts. An age like 「39 岁」 could be turned into a
 * birth year, but that guess is wrong for most of the year and it would be
 * written into the profile as if it were fact.
 */
function extractBirthday(lines: string[]): string {
  for (const line of lines.slice(0, NAME_SEARCH_LINES)) {
    if (!/出生|生日|\d{4}\s*[年./-]\s*\d{1,2}/.test(line)) continue;
    const m = line.match(DATE_YM_RE);
    if (!m) continue;
    const [, y, mo, d] = m;
    const ym = `${y}-${mo.padStart(2, '0')}`;
    return d ? `${ym}-${d.padStart(2, '0')}` : ym;
  }
  return '';
}

// ─── Work & project experience ────────────────────────────────────────────────

const WORK_SECTION_RE = /^(工作经历|工作经验|职业经历|工作履历|实习经历)\s*$/;
const PROJECT_SECTION_RE = /^(项目经历|项目经验|项目)\s*$/;
const OTHER_SECTION_RE =
  /^(教育经历|教育背景|专业技能|技能证书|技能特长|自我评价|自我介绍|个人优势|优势亮点|求职意向|求职期望|荣誉奖项|证书奖项|获奖情况|培训经历|语言能力|兴趣爱好|个人信息|基本信息|联系方式)\s*$/;

/** `2019.03-至今`, `2015/03 — 2019/02`, `2019年3月~2021年5月` */
const DATE_RANGE_RE =
  /((?:19|20)\d{2}\s*[年./-]\s*\d{1,2})\s*(?:月)?\s*[-–—~至到]+\s*((?:19|20)\d{2}\s*[年./-]\s*\d{1,2}\s*月?|至今|now|present|current)/i;

const COMPANY_SUFFIX_RE =
  /(有限公司|股份有限公司|集团|公司|科技|传媒|网络|信息|软件|银行|证券|研究院|研究所|事务所|工作室|中心|学校|医院|大学)/;

interface ParsedEntry {
  org: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
}

/** A short line that states a fact, as opposed to a line of body copy. */
function isAttrLine(line: string | undefined): boolean {
  if (!line) return false;
  const t = line.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (/^[-–—•·*>]/.test(t)) return false;          // bullet
  if (/[。！？；]$/.test(t)) return false;           // sentence
  if (/[:：]\s*$/.test(t)) return false;            // 「工作描述：」 / 「内容:」
  return true;
}

/** A line that is a date range and essentially nothing else. */
function isDateOnly(line: string | undefined): boolean {
  if (!line) return false;
  const m = line.match(DATE_RANGE_RE);
  if (!m) return false;
  return line.replace(m[0], '').replace(/[\s|｜·・,，-]/g, '').length <= 2;
}

/** A company suffix only counts at the END of a token. */
const ORG_TAIL_RE = new RegExp(`(?:${COMPANY_SUFFIX_RE.source})$`);

/** Does any whitespace-separated token end in a company suffix? */
function namesAnOrganisation(text: string): boolean {
  return text.split(/\s+/).some((tok) => ORG_TAIL_RE.test(tok));
}

/**
 * Split 「上海某某有限公司 产品经理 2019.03-至今」 into its parts.
 *
 * Character offsets are a trap: in 「示例网络科技有限公司 网络运营专员」 the
 * suffix list matches at four positions, one of them inside the job title. The
 * boundary that matters is the space, so the organisation is the run of tokens
 * up to and including the first one that ENDS in a suffix.
 */
function splitInlineHeader(line: string): { org: string; rest: string } {
  const cleaned = line
    .replace(DATE_RANGE_RE, ' ')
    .replace(/[|｜·・]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = cleaned.split(' ').filter(Boolean);
  const i = parts.findIndex((p) => ORG_TAIL_RE.test(p));
  if (i >= 0) return { org: parts.slice(0, i + 1).join(' '), rest: parts.slice(i + 1).join(' ') };
  return { org: cleaned, rest: '' };
}

/**
 * Split a section into entries on runs of short attribute lines.
 *
 * Measured against three real files, work and project entries have the same
 * shape: one to four short lines carrying the organisation, the role, a date
 * range and sometimes an industry, in any order, followed by prose. The only
 * difference is that a project's name has no company suffix.
 *
 * The previous parser anchored on the date range, on the theory that it was
 * the one marker every layout shares. It is not: one board export reaches the
 * date eight lines into the description, so that whole section yielded nothing.
 * Anchoring on the run and claiming each field by what it looks like covers
 * date-first, date-last and date-buried layouts with one rule.
 */
function parseEntries(lines: string[]): ParsedEntry[] {
  const attr = lines.map(isAttrLine);
  // A line carrying BOTH an organisation and a date is a complete header on
  // its own — 「上海某某有限公司 市场总监 2017.03-2023.03」. Several of those in
  // a row are several entries, not one entry with four attribute lines, so
  // they must not be merged into a run.
  const whole = lines.map((l, i) => attr[i] && namesAnOrganisation(l) && DATE_RANGE_RE.test(l));

  // A bare date never NAMES an entry. It may sit above the organisation (board
  // exports), below it, or several lines into the description — so it must not
  // open a run of its own, or the entry it belongs to loses its dates and the
  // date line becomes a nameless entry that gets discarded.
  const opens = lines.map(
    (l, i) => attr[i] && !isDateOnly(l) && !CJK_SECTION_HEADING.test(l.trim()),
  );

  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!opens[i]) continue;
    if (whole[i] || !(i > 0 && opens[i - 1] && !whole[i - 1])) starts.push(i);
  }

  // Pull contiguous date-only lines sitting directly above a start into that
  // entry rather than leaving them with the one before.
  const spanStart = starts.map((start, k) => {
    // -1 for the first entry: its date may be on the section's very first
    // line, and a floor of 0 stopped the walk before reaching it.
    const floor = k === 0 ? -1 : starts[k - 1];
    let from = start;
    while (from - 1 > floor && isDateOnly(lines[from - 1])) from--;
    return from;
  });

  return starts
    .map((start, k) => {
      const to = k + 1 < starts.length ? spanStart[k + 1] : lines.length;

      // The header is the contiguous run of naming lines from the start; the
      // rest of the span is description.
      const named: string[] = [];
      let h = start;
      while (h < to && attr[h] && !isDateOnly(lines[h]) && (h === start || !whole[h])) {
        named.push(lines[h].trim());
        h++;
      }
      const body = lines.slice(h, to);

      // The date may sit anywhere in the span — above the name, in the header
      // line itself, or buried in the description.
      const dated = lines.slice(spanStart[k], to).find((l) => DATE_RANGE_RE.test(l));
      const m = dated?.match(DATE_RANGE_RE);

      const head = splitInlineHeader(named[0] ?? '');
      const role =
        head.rest ||
        named.slice(1).find((l) => !DATE_RANGE_RE.test(l) && !namesAnOrganisation(l)) ||
        '';

      return {
        org: head.org.slice(0, 60),
        role: role.slice(0, 60),
        startDate: m ? normaliseDate(m[1].replace(/\s/g, '')) : '',
        endDate: m
          ? /至今|now|present|current/i.test(m[2])
            ? 'present'
            : normaliseDate(m[2].replace(/[\s月]/g, ''))
          : '',
        description: body.join('\n').trim().slice(0, 2000),
      };
    })
    // A run that yielded no name is not an entry, and a name with neither a
    // date, a description nor a company suffix is a stray line from someone
    // else's description. Dropping both is deliberate: a wrong entry gets
    // typed into a real application with nothing marking it as a guess.
    .filter((e) => e.org.length >= 2)
    .filter((e) => e.description || e.startDate || namesAnOrganisation(e.org))
    .slice(0, 10);
}

/** Return the line ranges that belong to each named section. */
function sliceSections(lines: string[], match: RegExp): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!match.test(lines[i])) continue;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (OTHER_SECTION_RE.test(lines[j]) || WORK_SECTION_RE.test(lines[j]) || PROJECT_SECTION_RE.test(lines[j])) break;
      body.push(lines[j]);
    }
    if (body.length) out.push(body);
  }
  return out;
}

function extractExperience(lines: string[]): {
  work: ExtractedResume['work'];
  projects: ExtractedResume['projects'];
} {
  const fromWork = sliceSections(lines, WORK_SECTION_RE).flatMap(parseEntries);
  const fromProjects = sliceSections(lines, PROJECT_SECTION_RE).flatMap(parseEntries);

  // Not every résumé uses headings, and PDF line reconstruction can fuse one
  // into the first entry beneath it. Scan the whole document when the work
  // section came back empty so those files are not a total loss.
  const pool = fromWork.length > 0 ? [...fromWork, ...fromProjects]
                                   : [...parseEntries(lines), ...fromProjects];

  // An entry naming 「…有限公司」 is a job, whichever heading it was filed
  // under. That is the reader's own test and it beats trusting a heading that
  // may not have survived the PDF. A school is neither — it belongs to
  // education and used to surface as a project.
  const seen = new Set<string>();
  const work: ExtractedResume['work'] = [];
  const projects: ExtractedResume['projects'] = [];

  for (const e of pool) {
    if (!e.org) continue;
    const key = `${e.org}|${e.startDate}|${e.role}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // A school is neither a job nor a project — it belongs to education, and
    // 「大学」 sits in the company-suffix list, so it has to be ruled out first.
    if (KNOWN_SCHOOLS_RE.test(e.org)) continue;

    if (namesAnOrganisation(e.org)) {
      work.push({
        company: e.org, title: e.role,
        startDate: e.startDate, endDate: e.endDate, description: e.description,
      });
    } else {
      projects.push({
        name: e.org, role: e.role,
        startDate: e.startDate, endDate: e.endDate, description: e.description,
      });
    }
  }

  return { work, projects };
}


// ─── Education ────────────────────────────────────────────────────────────────

function extractEducation(text: string, lines: string[]) {
  // Find the education section
  let eduStart = -1;
  let eduEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (eduStart === -1 && EDU_SECTION_RE.test(lines[i])) {
      eduStart = i + 1;
    } else if (eduStart !== -1 && SECTION_END_RE.test(lines[i])) {
      eduEnd = i;
      break;
    }
  }

  const eduLines = eduStart === -1 ? lines : lines.slice(eduStart, eduEnd);
  return parseEducationLines(eduLines);
}

function parseEducationLines(lines: string[]) {
  const entries: ExtractedResume['education'] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for a school name (known school or line containing degree keyword)
    const schoolMatch = line.match(KNOWN_SCHOOLS_RE);
    const hasDegree = DEGREE_RE.test(line);

    if (!schoolMatch && !hasDegree) continue;

    const school = schoolMatch ? schoolMatch[0] : '';

    // Try to extract degree
    const degreeMatch = line.match(DEGREE_RE);
    const degree = degreeMatch ? degreeMatch[0] : '';

    // Try to extract major: text between school and degree, or after degree
    let major = '';
    if (school && degree) {
      const afterSchool = line.slice(line.indexOf(school) + school.length);
      const beforeDegree = afterSchool.slice(0, afterSchool.indexOf(degree)).trim();
      major = beforeDegree.trim();
    } else if (school) {
      major = line.slice(line.indexOf(school) + school.length).trim();
    }

    // Date range: e.g. 2018.09-2022.06 or 2018.09~2022.06
    const dateMatch = line.match(/(\d{4}[.\-/年]\d{2})[\s\-~至到]+(\d{4}[.\-/年]\d{2}|present|至今)/i);
    const startDate = dateMatch ? normaliseDate(dateMatch[1]) : '';
    const endDate = dateMatch ? normaliseDate(dateMatch[2]) : '';

    // GPA: look at next line or current line
    let gpa = '';
    const gpaMatch = (line + (lines[i + 1] ?? '')).match(/GPA[\s:：]+(\d+\.?\d*\/\d+\.?\d*|\d+\.?\d*)/i);
    if (gpaMatch) gpa = gpaMatch[1];

    entries.push({ school, degree, major, gpa, startDate, endDate });
  }

  return entries;
}

function normaliseDate(raw: string): string {
  // 2018.09 → 2018-09
  return raw.replace(/[./年]/g, '-').replace(/-$/, '');
}

// ─── Skills ──────────────────────────────────────────────────────────────────

// Frameworks land in `tools`: the boards ask for skills once, so a separate
// bucket only split one answer across two fields the user had to maintain.
function extractSkills(text: string) {
  const languages: string[] = [];
  const tools: string[] = [];

  for (const skill of LANGUAGE_SKILLS) {
    if (new RegExp(`\\b${escapeRegex(skill)}\\b`, 'i').test(text)) {
      languages.push(skill);
    }
  }
  for (const skill of [...FRAMEWORK_SKILLS, ...TOOL_SKILLS]) {
    if (new RegExp(`\\b${escapeRegex(skill)}\\b`, 'i').test(text)) {
      tools.push(skill);
    }
  }

  return { languages, tools };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Convert extracted data to a full Resume ─────────────────────────────────

export function toResume(extracted: ExtractedResume, id: string, resumeName: string): Resume {
  const base = createEmptyResume(id, resumeName);
  const now = Date.now();
  return {
    ...base,
    basic: {
      ...base.basic,
      name: extracted.basic.name,
      phone: extracted.basic.phone
        ? [{ id: crypto.randomUUID(), value: extracted.basic.phone, label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '(imported)' }]
        : [],
      phonePinnedId: null,
      email: extracted.basic.email
        ? [{ id: crypto.randomUUID(), value: extracted.basic.email, label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '(imported)' }]
        : [],
      emailPinnedId: null,
      gender: extracted.basic.gender,
      birthday: extracted.basic.birthday,
      location: extracted.basic.location,
      ethnicity: extracted.basic.ethnicity,
      politicalStatus: extracted.basic.politicalStatus,
      workStartDate: extracted.basic.workStartDate,
      currentSalary: extracted.basic.currentSalary,
      jobStatus: extracted.basic.jobStatus,
      socialLinks: extracted.basic.wechat
        ? { ...base.basic.socialLinks, wechat: extracted.basic.wechat }
        : base.basic.socialLinks,
    },
    education: extracted.education.map((e) => ({
      ...base.education[0] ?? {
        school: '', schoolEn: '', degree: '', major: '', majorEn: '',
        gpa: '', gpaScale: '', startDate: '', endDate: '', honors: [],
      },
      school: e.school,
      degree: e.degree,
      major: e.major,
      gpa: e.gpa,
      startDate: e.startDate,
      endDate: e.endDate,
    })),
    work: extracted.work.map((w) => ({
      company: w.company,
      companyEn: '',
      title: w.title,
      titleEn: '',
      department: '',
      startDate: w.startDate,
      endDate: w.endDate,
      description: w.description,
      location: '',
    })),
    projects: extracted.projects.map((p) => ({
      name: p.name,
      role: p.role,
      startDate: p.startDate,
      endDate: p.endDate,
      description: p.description,
      techStack: [],
      link: '',
    })),
    skills: {
      ...base.skills,
      languages: extracted.skills.languages,
      tools: extracted.skills.tools,
    },
    jobPreference: {
      ...base.jobPreference,
      positions: extracted.jobPreference.positions,
      salaryRange: extracted.jobPreference.salaryRange,
    },
  };
}

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

// ─── Known Chinese universities (partial list for school extraction) ──────────

const KNOWN_SCHOOLS_RE = /北京大学|清华大学|复旦大学|上海交通大学|浙江大学|南京大学|武汉大学|中山大学|同济大学|厦门大学|中国人民大学|北京师范大学|华中科技大学|哈尔滨工业大学|西安交通大学|天津大学|四川大学|电子科技大学|北京航空航天大学|华南理工大学|中南大学|东南大学|山东大学|吉林大学|北京理工大学|兰州大学|中国农业大学|国防科技大学/;

// ─── Degree keywords ──────────────────────────────────────────────────────────

const DEGREE_RE = /博士|硕士|本科|大专|学士|PhD|Master|Bachelor|Associate/i;

// ─── Main extractor ───────────────────────────────────────────────────────────

export interface ExtractedResume {
  basic: {
    name: string;
    email: string;
    phone: string;
  };
  education: Array<{
    school: string;
    degree: string;
    major: string;
    gpa: string;
    startDate: string;
    endDate: string;
  }>;
  skills: {
    languages: string[];
    frameworks: string[];
    tools: string[];
  };
}

export function extractResumeFields(text: string): ExtractedResume {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const email = extractEmail(text);
  const phone = extractPhone(text);
  const name = extractName(lines, email, phone);
  const education = extractEducation(text, lines);
  const skills = extractSkills(text);

  return { basic: { name, email, phone }, education, skills };
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

function extractName(lines: string[], email: string, phone: string): string {
  for (const line of lines) {
    // Skip the email and phone lines
    if (email && line.includes(email)) continue;
    if (phone && line.includes(phone)) continue;
    if (looksLikeName(line)) return line;
  }
  return '';
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

function extractSkills(text: string) {
  const languages: string[] = [];
  const frameworks: string[] = [];
  const tools: string[] = [];

  for (const skill of LANGUAGE_SKILLS) {
    if (new RegExp(`\\b${escapeRegex(skill)}\\b`, 'i').test(text)) {
      languages.push(skill);
    }
  }
  for (const skill of FRAMEWORK_SKILLS) {
    if (new RegExp(`\\b${escapeRegex(skill)}\\b`, 'i').test(text)) {
      frameworks.push(skill);
    }
  }
  for (const skill of TOOL_SKILLS) {
    if (new RegExp(`\\b${escapeRegex(skill)}\\b`, 'i').test(text)) {
      tools.push(skill);
    }
  }

  return { languages, frameworks, tools };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Convert extracted data to a full Resume ─────────────────────────────────

export function toResume(extracted: ExtractedResume, id: string, resumeName: string): Resume {
  const base = createEmptyResume(id, resumeName);
  return {
    ...base,
    basic: {
      ...base.basic,
      name: extracted.basic.name,
      email: extracted.basic.email,
      phone: extracted.basic.phone,
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
    skills: {
      ...base.skills,
      languages: extracted.skills.languages,
      frameworks: extracted.skills.frameworks,
      tools: extracted.skills.tools,
    },
  };
}

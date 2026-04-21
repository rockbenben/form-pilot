// ─── Resume Meta ─────────────────────────────────────────────────────────────

export interface ResumeMeta {
  id: string;
  name: string;
  createdAt: number; // Unix ms timestamp
  updatedAt: number; // Unix ms timestamp
}

// ─── Basic Info ───────────────────────────────────────────────────────────────

export interface BasicInfo {
  name: string;
  nameEn: string;
  phone: string;
  email: string;
  gender: string;
  /** YYYY-MM-DD */
  birthday: string;
  /** Auto-calculable from birthday; can be stored explicitly */
  age: number;
  nationality: string;
  ethnicity: string;
  politicalStatus: string;
  location: string;
  willingLocations: string[];
  /** Base64-encoded avatar image */
  avatar: string;
  /** e.g. { github: 'https://...', linkedin: 'https://...' } */
  socialLinks: Record<string, string>;
}

// ─── Education ───────────────────────────────────────────────────────────────

export interface EducationEntry {
  school: string;
  schoolEn: string;
  degree: string;
  major: string;
  majorEn: string;
  gpa: string;
  gpaScale: string;
  startDate: string; // YYYY-MM
  endDate: string;   // YYYY-MM or 'present'
  honors: string[];
}

// ─── Work Experience ─────────────────────────────────────────────────────────

export interface WorkEntry {
  company: string;
  companyEn: string;
  title: string;
  titleEn: string;
  department: string;
  startDate: string;
  endDate: string;
  description: string;
  location: string;
}

// ─── Projects ────────────────────────────────────────────────────────────────

export interface ProjectEntry {
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  techStack: string[];
  link: string;
}

// ─── Skills ──────────────────────────────────────────────────────────────────

export interface Skills {
  languages: string[];
  frameworks: string[];
  tools: string[];
  certificates: string[];
}

// ─── Job Preference ──────────────────────────────────────────────────────────

export interface JobPreference {
  positions: string[];
  industries: string[];
  salaryRange: string;
  jobType: string;
  availableDate: string;
}

// ─── Custom Fields ────────────────────────────────────────────────────────────

export interface CustomField {
  key: string;
  value: string;
}

// ─── Full Resume ─────────────────────────────────────────────────────────────

export interface Resume {
  meta: ResumeMeta;
  basic: BasicInfo;
  education: EducationEntry[];
  work: WorkEntry[];
  projects: ProjectEntry[];
  skills: Skills;
  jobPreference: JobPreference;
  custom: CustomField[];
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface Settings {
  toolbarPosition: { x: number; y: number };
  apiKey: string;
  apiProvider: 'deepseek' | 'openai' | '';
  skipSensitive: boolean;
  /**
   * Hostnames (suffix match: `mokahr.com` also matches `jobs.mokahr.com`)
   * where the floating toolbar auto-appears. Pages not in this list stay
   * dormant unless they have saved drafts/memory or the user triggers fill
   * from the popup.
   */
  allowedDomains: string[];
}

// ─── Factory & Defaults ──────────────────────────────────────────────────────

export function createEmptyResume(id: string, name: string): Resume {
  const now = Date.now();
  return {
    meta: {
      id,
      name,
      createdAt: now,
      updatedAt: now,
    },
    basic: {
      name: '',
      nameEn: '',
      phone: '',
      email: '',
      gender: '',
      birthday: '',
      age: 0,
      nationality: '',
      ethnicity: '',
      politicalStatus: '',
      location: '',
      willingLocations: [],
      avatar: '',
      socialLinks: {},
    },
    education: [],
    work: [],
    projects: [],
    skills: {
      languages: [],
      frameworks: [],
      tools: [],
      certificates: [],
    },
    jobPreference: {
      positions: [],
      industries: [],
      salaryRange: '',
      jobType: '',
      availableDate: '',
    },
    custom: [],
  };
}

export const DEFAULT_ALLOWED_DOMAINS = [
  // Chinese recruitment platforms
  'mokahr.com', 'moka.com', 'zhaopin.com', 'liepin.com', 'zhipin.com',
  'lagou.com', 'nowcoder.com',
  // International ATS
  'myworkday.com', 'myworkdayjobs.com', 'greenhouse.io', 'lever.co',
  'icims.com', 'taleo.net', 'smartrecruiters.com',
  // Chinese tech company career sites
  'hotjob.cn', 'beisen.com', 'feishu.cn',
];

export const DEFAULT_SETTINGS: Settings = {
  toolbarPosition: { x: 16, y: 80 },
  apiKey: '',
  apiProvider: '',
  skipSensitive: true,
  // Spread so callers can't mutate the DEFAULT_ALLOWED_DOMAINS module export
  // via a shared-reference bug.
  allowedDomains: [...DEFAULT_ALLOWED_DOMAINS],
};

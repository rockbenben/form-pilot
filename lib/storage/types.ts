import type { PatchOf } from './merge-resume-patch';
import type { FieldCandidate } from '@/lib/capture/candidate';

// ─── Resume Meta ─────────────────────────────────────────────────────────────

interface ResumeMeta {
  id: string;
  name: string;
  createdAt: number; // Unix ms timestamp
  updatedAt: number; // Unix ms timestamp
}

// ─── Basic Info ───────────────────────────────────────────────────────────────

export interface BasicInfo {
  name: string;
  nameEn: string;
  phone: FieldCandidate[];           // Phase B: multi-candidate
  phonePinnedId: string | null;      // Phase B
  email: FieldCandidate[];           // Phase B: multi-candidate
  emailPinnedId: string | null;      // Phase B
  gender: string;
  /** YYYY-MM-DD */
  birthday: string;
  /** Auto-calculable from birthday; can be stored explicitly */
  age: number;
  nationality: string;
  ethnicity: string;
  politicalStatus: string;
  location: string;
  /**
   * When the person first started working, `YYYY-MM`. Chinese boards ask for
   * this rather than for years of experience, and derive the years from it —
   * 智联招聘 and BOSS 直聘 both have the field.
   */
  workStartDate: string;
  /**
   * Present salary, as the user chooses to write it. Kept apart from
   * `jobPreference.salaryRange`, which is what they are asking for next.
   */
  currentSalary: string;
  /** 在职 / 离职 / 随时到岗 — asked for on every Chinese board. */
  jobStatus: string;
  /**
   * The free-text pitch every Chinese board opens a resume with — 个人优势 on
   * BOSS, 优势内容 on 智联, 优势亮点 on 猎聘. All three have it and it was the
   * one major resume section with nowhere to go.
   */
  summary: string;
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

/**
 * Every board surveyed asks for skills in one field (技能标签 / 技能关键词),
 * so the schema keeps only the buckets a form can actually receive. A separate
 * `frameworks` list had nowhere to go and only inflated the completeness
 * denominator; stored values are folded into `tools` on read.
 */
export interface Skills {
  languages: string[];
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

/**
 * What callers may send to update a resume.
 *
 * `basic` deep-merges (see mergeResumePatch), so a caller may send only the
 * scalars it changed; every other top-level key shallow-replaces and must be
 * complete. The signature used to be `Partial<Omit<Resume, 'meta'>>`, which
 * types `basic` as a whole BasicInfo — a lie, since the debounced field editor
 * has always sent partial `basic` deltas deliberately.
 */
export type ResumePatch = PatchOf<Omit<Resume, 'meta'>>;

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface Settings {
  toolbarPosition: { x: number; y: number };
  skipSensitive: boolean;
  /**
   * 'auto'   — the toolbar appears when the page probes as an application form.
   * 'manual' — it never appears on its own; the user summons it with the
   *            keyboard command or the popup.
   */
  triggerMode: 'auto' | 'manual';
  /** Per-site override, suffix-matched. Overrides `triggerMode`. */
  siteOverrides: Record<string, 'always' | 'never'>;
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
      phone: [],
      phonePinnedId: null,
      email: [],
      emailPinnedId: null,
      gender: '',
      birthday: '',
      age: 0,
      nationality: '',
      ethnicity: '',
      politicalStatus: '',
      location: '',
      workStartDate: '',
      currentSalary: '',
      jobStatus: '',
      summary: '',
      avatar: '',
      socialLinks: {},
    },
    education: [],
    work: [],
    projects: [],
    skills: {
      languages: [],
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

export const DEFAULT_SETTINGS: Settings = {
  toolbarPosition: { x: 16, y: 80 },
  skipSensitive: true,
  triggerMode: 'auto',
  siteOverrides: {},
};

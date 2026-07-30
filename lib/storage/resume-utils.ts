import type { Resume } from './types';

/**
 * Count filled vs total resume fields for completeness indicator.
 * Used by StatusBar (dashboard) and the popup App.
 *
 * The denominator is deliberately "fields FormPilot can actually fill into a
 * form". It used to include `basic.willingLocations` and `skills.frameworks`,
 * which no board asks for — so the bar could never reach 100% no matter what
 * the user typed, and the two fields holding it back were the two nothing on
 * screen explained. Both are gone from the schema now.
 *
 * `basic.summary` is counted because 个人优势 / 优势内容 / 优势亮点 opens the
 * resume on all three boards surveyed. `basic.currentSalary` is not: every
 * board that asks marks it 选填, and nobody should have to disclose their pay
 * to see a full progress bar.
 */
export function countFields(resume: Resume): { filled: number; total: number } {
  let filled = 0;
  let total = 0;

  const countString = (v: string) => { total++; if (v && v.trim()) filled++; };
  const countArray = (v: unknown[]) => { total++; if (v.length > 0) filled++; };

  // Basic info
  const b = resume.basic;
  countString(b.name);
  countArray(b.phone);
  countArray(b.email);
  countString(b.gender);
  countString(b.birthday);
  countString(b.nationality);
  countString(b.location);
  countString(b.workStartDate);
  countString(b.jobStatus);
  countString(b.summary);

  // Education
  total++;
  if (resume.education.length > 0) filled++;

  // Work
  total++;
  if (resume.work.length > 0) filled++;

  // Projects
  total++;
  if (resume.projects.length > 0) filled++;

  // Skills
  const s = resume.skills;
  countArray(s.languages);
  countArray(s.tools);
  countArray(s.certificates);

  // Job preference
  const j = resume.jobPreference;
  countArray(j.positions);
  countArray(j.industries);
  countString(j.salaryRange);
  countString(j.jobType);
  countString(j.availableDate);

  return { filled, total };
}

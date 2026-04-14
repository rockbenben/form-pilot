import type { Resume } from './types';

/**
 * Count filled vs total resume fields for completeness indicator.
 * Used by StatusBar (dashboard) and the popup App.
 */
export function countFields(resume: Resume): { filled: number; total: number } {
  let filled = 0;
  let total = 0;

  const countString = (v: string) => { total++; if (v && v.trim()) filled++; };
  const countArray = (v: unknown[]) => { total++; if (v.length > 0) filled++; };

  // Basic info
  const b = resume.basic;
  countString(b.name);
  countString(b.phone);
  countString(b.email);
  countString(b.gender);
  countString(b.birthday);
  countString(b.nationality);
  countString(b.location);
  countArray(b.willingLocations);

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
  countArray(s.frameworks);
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

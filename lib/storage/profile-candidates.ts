// lib/storage/profile-candidates.ts
import { getResume, updateResume } from './resume-store';
import {
  clearPrefsPointingToProfileCandidate,
  type ProfileCandidatePath,
} from './profile-domain-prefs-store';
import { candidateMatches, type FieldCandidate } from '@/lib/capture/candidate';

export type { ProfileCandidatePath } from './profile-domain-prefs-store';

function pathArrayKey(path: ProfileCandidatePath): 'phone' | 'email' {
  return path === 'basic.phone' ? 'phone' : 'email';
}

function pathPinKey(path: ProfileCandidatePath): 'phonePinnedId' | 'emailPinnedId' {
  return path === 'basic.phone' ? 'phonePinnedId' : 'emailPinnedId';
}

function newCandidate(value: string, label: string, lastUrl: string, hitCount: number): FieldCandidate {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    value,
    label,
    hitCount,
    createdAt: now,
    updatedAt: now,
    lastUrl,
  };
}

/**
 * Save-to-Profile path: if the value matches an existing candidate, bump.
 * Otherwise append a new candidate with empty label and hitCount 1.
 */
export async function upsertProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  value: string,
  sourceUrl: string,
): Promise<{ candidateId: string; bumped: boolean }> {
  const resume = await getResume(resumeId);
  if (!resume) throw new Error(`Resume not found: ${resumeId}`);
  const arrKey = pathArrayKey(path);
  const candidates = resume.basic[arrKey];
  const match = candidates.find((c) => candidateMatches(c, value, undefined));
  if (match) {
    match.hitCount++;
    match.updatedAt = Date.now();
    match.lastUrl = sourceUrl;
    await updateResume(resumeId, { basic: resume.basic });
    return { candidateId: match.id, bumped: true };
  }
  const fresh = newCandidate(value, '', sourceUrl, 1);
  candidates.push(fresh);
  await updateResume(resumeId, { basic: resume.basic });
  return { candidateId: fresh.id, bumped: false };
}

/**
 * Manually add a candidate from the Dashboard. Rejects duplicate value.
 * Returns the new id, or null if rejected / unknown resume.
 */
export async function addProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  value: string,
  label: string,
): Promise<string | null> {
  const resume = await getResume(resumeId);
  if (!resume) return null;
  const arrKey = pathArrayKey(path);
  const candidates = resume.basic[arrKey];
  if (candidates.some((c) => candidateMatches(c, value, undefined))) return null;
  const fresh = newCandidate(value, label, '(manual)', 0);
  candidates.push(fresh);
  await updateResume(resumeId, { basic: resume.basic });
  return fresh.id;
}

/**
 * Edit a candidate's value and/or label. Id unchanged. Rejects duplicate value.
 */
export async function updateProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
  value: string,
  label: string,
): Promise<void> {
  const resume = await getResume(resumeId);
  if (!resume) return;
  const arrKey = pathArrayKey(path);
  const candidates = resume.basic[arrKey];
  const c = candidates.find((x) => x.id === candidateId);
  if (!c) return;
  if (candidates.some((x) => x.id !== candidateId && candidateMatches(x, value, undefined))) return;
  c.value = value;
  c.label = label;
  c.updatedAt = Date.now();
  await updateResume(resumeId, { basic: resume.basic });
}

/**
 * Remove a candidate and cascade-clean pin + domain prefs.
 */
export async function deleteProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
): Promise<void> {
  const resume = await getResume(resumeId);
  if (!resume) return;
  const arrKey = pathArrayKey(path);
  const pinKey = pathPinKey(path);
  const candidates = resume.basic[arrKey];
  const before = candidates.length;
  resume.basic[arrKey] = candidates.filter((c) => c.id !== candidateId);
  if (resume.basic[arrKey].length === before) return; // no-op: not found
  if (resume.basic[pinKey] === candidateId) resume.basic[pinKey] = null;
  await updateResume(resumeId, { basic: resume.basic });
  await clearPrefsPointingToProfileCandidate(resumeId, path, candidateId);
}

export async function setProfilePin(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string | null,
): Promise<void> {
  const resume = await getResume(resumeId);
  if (!resume) return;
  const arrKey = pathArrayKey(path);
  const pinKey = pathPinKey(path);
  if (candidateId !== null && !resume.basic[arrKey].some((c) => c.id === candidateId)) return;
  resume.basic[pinKey] = candidateId;
  await updateResume(resumeId, { basic: resume.basic });
}

export async function bumpProfileCandidateHit(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
  sourceUrl: string,
): Promise<void> {
  const resume = await getResume(resumeId);
  if (!resume) return;
  const arrKey = pathArrayKey(path);
  const c = resume.basic[arrKey].find((x) => x.id === candidateId);
  if (!c) return;
  c.hitCount++;
  c.updatedAt = Date.now();
  c.lastUrl = sourceUrl;
  await updateResume(resumeId, { basic: resume.basic });
}

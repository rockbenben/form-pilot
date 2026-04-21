// lib/storage/profile-domain-prefs-store.ts

const KEY = 'formpilot:profileDomainPrefs';

export type ProfileCandidatePath = 'basic.phone' | 'basic.email';

/** resumeId → resumePath → domain → candidateId */
export type ProfileDomainPrefs = Record<string, Record<string, Record<string, string>>>;

async function readAll(): Promise<ProfileDomainPrefs> {
  const res = await chrome.storage.local.get(KEY);
  return (res[KEY] as ProfileDomainPrefs | undefined) ?? {};
}

async function writeAll(all: ProfileDomainPrefs): Promise<void> {
  await chrome.storage.local.set({ [KEY]: all });
}

/** Return the {path: {domain: candidateId}} slice for one resume. Empty object if unknown. */
export async function listForResume(
  resumeId: string,
): Promise<Record<string, Record<string, string>>> {
  const all = await readAll();
  return all[resumeId] ?? {};
}

export async function setProfileDomainPref(
  resumeId: string,
  path: ProfileCandidatePath,
  domain: string,
  candidateId: string,
): Promise<void> {
  const all = await readAll();
  if (!all[resumeId]) all[resumeId] = {};
  if (!all[resumeId][path]) all[resumeId][path] = {};
  all[resumeId][path][domain] = candidateId;
  await writeAll(all);
}

export async function clearProfileDomainPref(
  resumeId: string,
  path: ProfileCandidatePath,
  domain: string,
): Promise<void> {
  const all = await readAll();
  const r = all[resumeId];
  if (!r || !r[path]) return;
  delete r[path][domain];
  if (Object.keys(r[path]).length === 0) delete r[path];
  if (Object.keys(r).length === 0) delete all[resumeId];
  await writeAll(all);
}

export async function clearProfileDomainPrefsForPath(
  resumeId: string,
  path: ProfileCandidatePath,
): Promise<void> {
  const all = await readAll();
  const r = all[resumeId];
  if (!r || !r[path]) return;
  delete r[path];
  if (Object.keys(r).length === 0) delete all[resumeId];
  await writeAll(all);
}

export async function clearProfileDomainPrefsForResume(
  resumeId: string,
): Promise<void> {
  const all = await readAll();
  if (!all[resumeId]) return;
  delete all[resumeId];
  await writeAll(all);
}

/** Remove any (domain → candidateId) pair in this (resume, path) whose candidateId matches. */
export async function clearPrefsPointingToProfileCandidate(
  resumeId: string,
  path: ProfileCandidatePath,
  candidateId: string,
): Promise<void> {
  const all = await readAll();
  const pathMap = all[resumeId]?.[path];
  if (!pathMap) return;
  for (const [domain, id] of Object.entries(pathMap)) {
    if (id === candidateId) delete pathMap[domain];
  }
  if (Object.keys(pathMap).length === 0) delete all[resumeId][path];
  if (all[resumeId] && Object.keys(all[resumeId]).length === 0) delete all[resumeId];
  await writeAll(all);
}

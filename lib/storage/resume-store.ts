import { type Resume, type ResumePatch, createEmptyResume } from './types';
import { mergeResumePatch } from './merge-resume-patch';

const KEY_RESUMES = 'formpilot:resumes';
const KEY_ACTIVE_RESUME_ID = 'formpilot:activeResumeId';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function readAll(): Promise<Resume[]> {
  const result = await chrome.storage.local.get(KEY_RESUMES);
  return ((result[KEY_RESUMES] as Resume[] | undefined) ?? []).map(normalize);
}

/**
 * Fold values from dropped fields into the ones that replaced them.
 *
 * `skills.frameworks` was removed because no job board has a field for it —
 * it could only ever sit in the profile inflating the completeness
 * denominator. Its values are real skills the user typed, so they move to
 * `skills.tools`, which boards do ask for (技能标签 / 技能关键词).
 *
 * Read-time only, no write-back: the merge is idempotent and costs a array
 * concat, and persisting on read would make every getter a writer.
 */
function normalize(r: Resume): Resume {
  const legacy = (r.skills as { frameworks?: unknown }).frameworks;
  if (!Array.isArray(legacy) || legacy.length === 0) return r;
  const tools = r.skills.tools ?? [];
  const merged = [...tools, ...legacy.filter((v) => typeof v === 'string' && !tools.includes(v))];
  return { ...r, skills: { ...r.skills, frameworks: undefined, tools: merged } as Resume['skills'] };
}

async function writeAll(resumes: Resume[]): Promise<void> {
  await chrome.storage.local.set({ [KEY_RESUMES]: resumes });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/** Create a new resume with an auto-generated id. */
export async function createResume(name: string): Promise<Resume> {
  const id = generateId();
  const resume = createEmptyResume(id, name);
  const all = await readAll();
  all.push(resume);
  await writeAll(all);
  return resume;
}

/** Return all stored resumes. */
export async function listResumes(): Promise<Resume[]> {
  return readAll();
}

/** Return a resume by id, or null if not found. */
export async function getResume(id: string): Promise<Resume | null> {
  const all = await readAll();
  return all.find((r) => r.meta.id === id) ?? null;
}

/**
 * Merge partial fields into an existing resume and bump updatedAt. Uses the
 * shared {@link mergeResumePatch} rule so `basic` deep-merges (candidate arrays
 * written out-of-band survive a field-edit delta and vice versa).
 */
export async function updateResume(id: string, patch: ResumePatch): Promise<Resume> {
  const all = await readAll();
  const idx = all.findIndex((r) => r.meta.id === id);
  if (idx === -1) throw new Error(`Resume not found: ${id}`);

  const existing = all[idx];
  const updated: Resume = {
    ...mergeResumePatch(existing, patch),
    meta: { ...existing.meta, updatedAt: Date.now() },
  };
  all[idx] = updated;
  await writeAll(all);
  return updated;
}

/**
 * Delete a resume and everything keyed to it.
 *
 * The whole cascade lives here. It used to be split: this function cleared the
 * per-resume domain prefs while the Dashboard separately repointed
 * `activeResumeId`, so calling it from anywhere else left a dangling pointer,
 * and two layers each owned half of one invariant. Storage owns it now, and
 * callers only have to re-read.
 */
export async function deleteResume(id: string): Promise<void> {
  const all = await readAll();
  const remaining = all.filter((r) => r.meta.id !== id);
  await writeAll(remaining);

  const { clearProfileDomainPrefsForResume } = await import('./profile-domain-prefs-store');
  await clearProfileDomainPrefsForResume(id);

  if ((await getActiveResumeId()) !== id) return;

  // The deleted resume was the active one, so something else has to take over.
  //
  // Storage keeps creation order, so the first survivor is the OLDEST profile —
  // for most people the blank one they made before importing anything. Deleting
  // a profile would silently switch them to it and every fill would come back
  // almost entirely 「missing from your profile」, with nothing on screen saying
  // the active profile had changed. The most recently updated survivor is the
  // one they were actually working in.
  const successor = successorAfterDelete(all, id);
  if (!successor) {
    await chrome.storage.local.remove(KEY_ACTIVE_RESUME_ID);
    return;
  }
  await setActiveResumeId(successor.meta.id);
}

/**
 * Which profile takes over if `id` is deleted, or null if it was the last one.
 *
 * Exported so the confirmation dialog can name the successor before the user
 * commits, using the same rule the delete itself applies. Re-deriving it in the
 * UI is how the two halves of this invariant drifted apart the first time.
 */
export function successorAfterDelete(resumes: Resume[], id: string): Resume | null {
  const remaining = resumes.filter((r) => r.meta.id !== id);
  return remaining.length > 0 ? pickMostRecent(remaining) : null;
}

/**
 * Rename a resume. Trims whitespace; empty names throw instead of silently
 * clearing the label. Bumps updatedAt.
 */
export async function renameResume(id: string, newName: string): Promise<Resume> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Resume name cannot be empty');
  const all = await readAll();
  const idx = all.findIndex((r) => r.meta.id === id);
  if (idx === -1) throw new Error(`Resume not found: ${id}`);
  const existing = all[idx];
  const updated: Resume = {
    ...existing,
    meta: { ...existing.meta, name: trimmed, updatedAt: Date.now() },
  };
  all[idx] = updated;
  await writeAll(all);
  return updated;
}

// ─── Active resume ────────────────────────────────────────────────────────────

export async function getActiveResumeId(): Promise<string | null> {
  const result = await chrome.storage.local.get(KEY_ACTIVE_RESUME_ID);
  return (result[KEY_ACTIVE_RESUME_ID] as string | undefined) ?? null;
}

export async function setActiveResumeId(id: string): Promise<void> {
  await chrome.storage.local.set({ [KEY_ACTIVE_RESUME_ID]: id });
}

/**
 * Resolve the resume that reads should use, repairing a missing or stale
 * selection on the way.
 *
 * `activeResumeId` is only ever written by the Dashboard — on create, explicit
 * switch, import, and delete — so it can be absent while resumes exist. The
 * popup used to paper over that with a display-only fallback to the first
 * resume, while the fill path had no fallback at all and silently ran against
 * an empty profile. The result was the worst possible pairing: a popup showing
 * a healthy completion bar next to fills that produced almost nothing.
 *
 * Every caller now goes through here, and the repaired id is persisted, so the
 * display and the fill can no longer disagree about which resume is active.
 *
 * Returns null only when the user genuinely has no resumes yet.
 */
export async function resolveActiveResume(): Promise<Resume | null> {
  const all = await readAll();
  if (all.length === 0) return null;

  const id = await getActiveResumeId();
  const selected = id ? all.find((r) => r.meta.id === id) : undefined;
  if (selected) return selected;

  // Absent or dangling selection — adopt the most recently updated profile and
  // write it back, so the next read is a plain hit rather than another repair.
  // Storage keeps creation order, so taking the first would hand the user their
  // oldest profile, which is usually the blank one from before they imported.
  const best = pickMostRecent(all);
  await setActiveResumeId(best.meta.id);
  return best;
}

/**
 * The profile a user would expect to land on when the choice is made for them.
 *
 * Creation order says nothing about which profile someone actually works in;
 * `updatedAt` does.
 */
function pickMostRecent(resumes: Resume[]): Resume {
  return resumes.reduce((best, r) => (r.meta.updatedAt > best.meta.updatedAt ? r : best));
}

// ─── Import / Export ─────────────────────────────────────────────────────────

/** Serialize a resume to a JSON string for export. */
export async function exportResume(id: string): Promise<string> {
  const resume = await getResume(id);
  if (!resume) throw new Error(`Resume not found: ${id}`);
  return JSON.stringify(resume, null, 2);
}

/**
 * Import a resume from a JSON string.
 * A new id is assigned so it never collides with existing entries.
 * Missing top-level fields are filled in from a blank resume so that
 * partial exports don't crash the popup.
 */
export async function importResume(json: string): Promise<Resume> {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid resume JSON: not an object');
  }
  // Legacy single-value schema compatibility: wrap string phone/email into
  // single-candidate arrays so old JSONs remain importable.
  if (parsed.basic && typeof parsed.basic === 'object') {
    const now = Date.now();
    if (typeof parsed.basic.phone === 'string') {
      const v = parsed.basic.phone;
      parsed.basic.phone = v
        ? [{ id: crypto.randomUUID(), value: v, label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '(imported)' }]
        : [];
      parsed.basic.phonePinnedId = null;
    }
    if (typeof parsed.basic.email === 'string') {
      const v = parsed.basic.email;
      parsed.basic.email = v
        ? [{ id: crypto.randomUUID(), value: v, label: '', hitCount: 0, createdAt: now, updatedAt: now, lastUrl: '(imported)' }]
        : [];
      parsed.basic.emailPinnedId = null;
    }
  }

  // Merge with empty resume to fill missing fields
  const base = createEmptyResume(generateId(), parsed.meta?.name ?? 'Imported');
  const resume: Resume = {
    ...base,
    basic: { ...base.basic, ...(parsed.basic ?? {}) },
    education: Array.isArray(parsed.education) ? parsed.education : [],
    work: Array.isArray(parsed.work) ? parsed.work : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    skills: { ...base.skills, ...(parsed.skills ?? {}) },
    jobPreference: { ...base.jobPreference, ...(parsed.jobPreference ?? {}) },
    custom: Array.isArray(parsed.custom) ? parsed.custom : [],
    meta: { ...base.meta, name: parsed.meta?.name ?? 'Imported' },
  };
  const resumes = await readAll();
  resumes.push(resume);
  await writeAll(resumes);

  // Importing is an act of intent: the whole point is to start using the
  // profile you just brought in. It used to land in the list without becoming
  // active, so the Dashboard stayed on the old profile and the import looked
  // like it had done nothing — the new data was there, just not on screen.
  // Done here rather than in the dialog so the JSON and résumé paths, and any
  // future caller, all behave the same way.
  await setActiveResumeId(resume.meta.id);
  return resume;
}

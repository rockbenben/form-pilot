import { type Resume, createEmptyResume } from './types';

const KEY_RESUMES = 'formpilot:resumes';
const KEY_ACTIVE_RESUME_ID = 'formpilot:activeResumeId';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function readAll(): Promise<Resume[]> {
  const result = await chrome.storage.local.get(KEY_RESUMES);
  return (result[KEY_RESUMES] as Resume[] | undefined) ?? [];
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

/** Shallow-merge partial fields into an existing resume and bump updatedAt. */
export async function updateResume(
  id: string,
  patch: Partial<Omit<Resume, 'meta'>>,
): Promise<Resume> {
  const all = await readAll();
  const idx = all.findIndex((r) => r.meta.id === id);
  if (idx === -1) throw new Error(`Resume not found: ${id}`);

  const existing = all[idx];
  const updated: Resume = {
    ...existing,
    ...patch,
    meta: { ...existing.meta, updatedAt: Date.now() },
  };
  all[idx] = updated;
  await writeAll(all);
  return updated;
}

/** Delete a resume by id. No-op if not found. */
export async function deleteResume(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((r) => r.meta.id !== id));
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
  return resume;
}

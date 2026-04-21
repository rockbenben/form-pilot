/** Draft key: strip hash; keep query (different jobs should not share drafts). */
export function normalizeUrlForDraft(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

/** Memory key: strip hash AND query (same-path pages share memorized values). */
export function normalizeUrlForMemory(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return u.toString();
  } catch {
    return url;
  }
}

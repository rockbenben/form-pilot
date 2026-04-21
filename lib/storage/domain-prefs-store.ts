// lib/storage/domain-prefs-store.ts
const KEY = 'formpilot:fieldDomainPrefs';

export type FieldDomainPrefs = Record<string, Record<string, string>>;

export async function listFieldDomainPrefs(): Promise<FieldDomainPrefs> {
  const res = await chrome.storage.local.get(KEY);
  return (res[KEY] as FieldDomainPrefs | undefined) ?? {};
}

async function writeAll(all: FieldDomainPrefs): Promise<void> {
  await chrome.storage.local.set({ [KEY]: all });
}

export async function setDomainPref(
  signature: string,
  domain: string,
  candidateId: string,
): Promise<void> {
  const all = await listFieldDomainPrefs();
  if (!all[signature]) all[signature] = {};
  all[signature][domain] = candidateId;
  await writeAll(all);
}

export async function clearDomainPref(
  signature: string,
  domain: string,
): Promise<void> {
  const all = await listFieldDomainPrefs();
  if (!all[signature]) return;
  delete all[signature][domain];
  if (Object.keys(all[signature]).length === 0) delete all[signature];
  await writeAll(all);
}

export async function clearDomainPrefsForSignature(
  signature: string,
): Promise<void> {
  const all = await listFieldDomainPrefs();
  if (!all[signature]) return;
  delete all[signature];
  await writeAll(all);
}

export async function clearPrefsPointingToCandidate(
  signature: string,
  candidateId: string,
): Promise<void> {
  const all = await listFieldDomainPrefs();
  const sigMap = all[signature];
  if (!sigMap) return;
  for (const [domain, id] of Object.entries(sigMap)) {
    if (id === candidateId) delete sigMap[domain];
  }
  if (Object.keys(sigMap).length === 0) delete all[signature];
  await writeAll(all);
}

export async function clearAllFieldDomainPrefs(): Promise<void> {
  await chrome.storage.local.set({ [KEY]: {} });
}

/** Normalize a hostname for use as a domain-pref key. Strips leading `www.`. */
export function normalizeDomain(hostname: string): string {
  return hostname.replace(/^www\./, '');
}

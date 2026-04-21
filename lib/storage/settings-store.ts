import { type Settings, DEFAULT_SETTINGS } from './types';

const SETTINGS_KEY = 'formpilot:settings';
const API_KEY_KEY = 'formpilot:apiKey';

/**
 * Return stored settings, falling back to defaults for any missing fields.
 *
 * Non-sensitive settings are read from chrome.storage.local (persists across
 * browser restarts). The API key is read from chrome.storage.session (cleared
 * when the browser closes), limiting its exposure window.
 */
export async function getSettings(): Promise<Settings> {
  const [localResult, sessionResult] = await Promise.all([
    chrome.storage.local.get(SETTINGS_KEY),
    chrome.storage.session?.get(API_KEY_KEY).catch(() => ({})) ?? Promise.resolve({}),
  ]);
  const base = (localResult[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {};
  const apiKey = (sessionResult as Record<string, string>)[API_KEY_KEY] ?? '';
  const merged: Settings = { ...DEFAULT_SETTINGS, ...base, apiKey };
  // Always hand callers a fresh array so ad-hoc mutations on
  // settings.allowedDomains never touch the DEFAULT export or the
  // in-memory stored snapshot.
  return { ...merged, allowedDomains: [...merged.allowedDomains] };
}

/**
 * Shallow-merge a partial settings object and persist the result.
 *
 * The API key is stored in chrome.storage.session; everything else goes to
 * chrome.storage.local.
 */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated: Settings = { ...current, ...patch };

  // Store API key in session storage (cleared on browser close)
  if ('apiKey' in patch) {
    if (chrome.storage.session) {
      await chrome.storage.session.set({ [API_KEY_KEY]: updated.apiKey });
    }
  }

  // Store everything except the API key in local storage
  const { apiKey: _apiKey, ...localSettings } = updated;
  await chrome.storage.local.set({ [SETTINGS_KEY]: localSettings });

  return updated;
}

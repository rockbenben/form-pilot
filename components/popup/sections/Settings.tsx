import React, { useEffect, useState } from 'react';
import type { Settings } from '@/lib/storage/types';
import { getSettings, updateSettings } from '@/lib/storage/settings-store';
import { useI18n } from '@/lib/i18n';
import { STATUS_COLORS } from '@/lib/ui/field-status';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400';

/**
 * A titled group of related controls.
 *
 * The panel used to run everything under one 「保存/恢复」 heading, including
 * the trigger mode and the site rules, neither of which is about saving. Each
 * group now says what it actually governs.
 */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-gray-800 pt-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function SettingsSection() {
  const { t, locale, setLocale } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleChange = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try {
      await updateSettings(patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  // Routed through the background's SET_SITE_OVERRIDE handler (a fresh
  // read-modify-write) rather than a client-held full-map replacement — this
  // panel fetches settings once on mount and never refreshes, so writing a
  // locally-computed siteOverrides object would silently drop any rule
  // another tab (toolbar "Never on this site", popup Undo) wrote after this
  // panel's initial load. Refresh from storage afterward to reflect the
  // merged result, including anything else that changed concurrently.
  const handleRemoveOverride = async (domain: string) => {
    setSaving(true);
    try {
      await chrome.runtime.sendMessage({ type: 'SET_SITE_OVERRIDE', domain, value: null });
    } catch { /* ignore */ }
    try {
      const fresh = await getSettings();
      setSettings(fresh);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <p className="text-sm text-gray-500">{t('import.parsing')}</p>;
  }

  const overrides = Object.entries(settings.siteOverrides);

  return (
    // Capped rather than stretched: these are short controls, and a 1500px-wide
    // row of them puts the label and its control at opposite ends of the screen.
    <div className="max-w-xl flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-100">{t('settings.title')}</h2>
        <span
          className={`text-xs transition-opacity ${saving || saved ? 'opacity-100' : 'opacity-0'}`}
          style={{ color: saved && !saving ? STATUS_COLORS.filled : undefined }}
        >
          {saving ? t('status.saving') : t('status.saved')}
        </span>
      </div>

      <Group title={t('settings.group.general')}>
        {/* Label and control sit next to each other. Pushed apart with
            justify-between they ended up ~470px from one another for a
            two-option select — the same broken relationship the site-rules
            list had. */}
        <label className="flex items-center gap-3">
          <span className="text-sm text-gray-300">{t('settings.language')}</span>
          <select
            className={`w-40 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm
              text-gray-200 hover:border-gray-600 transition-colors ${focusRing}`}
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'zh' | 'en')}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
      </Group>

      <Group title={t('settings.trigger.mode')}>
        <div className="flex flex-col gap-2">
          {(['auto', 'manual'] as const).map((mode) => {
            const active = settings.triggerMode === mode;
            return (
              <label
                key={mode}
                className={`flex items-start gap-2.5 rounded border px-3 py-2.5 cursor-pointer transition-colors
                  ${active
                    ? 'border-blue-500/60 bg-blue-500/10'
                    : 'border-gray-800 hover:border-gray-700 hover:bg-gray-900/60'
                  }`}
              >
                <input
                  type="radio"
                  name="triggerMode"
                  className={`mt-0.5 ${focusRing}`}
                  checked={active}
                  onChange={() => handleChange({ triggerMode: mode })}
                />
                <span className="text-sm leading-snug">
                  <span className={active ? 'text-gray-100' : 'text-gray-300'}>
                    {t(`settings.trigger.${mode}.label`)}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {t(`settings.trigger.${mode}.hint`)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-gray-600 mt-2">{t('settings.trigger.hint')}</p>
      </Group>

      <Group title={t('settings.sites.title')}>
        {overrides.length === 0 ? (
          <p className="text-sm text-gray-600">{t('settings.sites.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-800/80 border border-gray-800 rounded overflow-hidden">
            {overrides.map(([domain, value]) => (
              <li
                key={domain}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-900/60 transition-colors"
              >
                {/* Domain and its rule sit next to each other. They used to be
                    pushed to opposite ends by justify-between, so at full width
                    nothing connected a row's domain to its own status. */}
                <span className="text-sm text-gray-200 truncate">{domain}</span>
                <span
                  className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded
                    ${value === 'always'
                      ? 'bg-blue-500/15 text-blue-300'
                      : 'bg-gray-800 text-gray-400'
                    }`}
                >
                  {t(`settings.sites.${value}`)}
                </span>
                <span className="flex-1" />
                <button
                  onClick={() => handleRemoveOverride(domain)}
                  className={`shrink-0 text-xs text-gray-500 hover:text-red-400 transition-colors rounded ${focusRing}`}
                >
                  {t('settings.sites.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-600 mt-2">{t('settings.sites.hint')}</p>
      </Group>

      <Group title={t('settings.group.privacy')}>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className={`mt-0.5 ${focusRing}`}
            checked={settings.skipSensitive}
            onChange={(e) => handleChange({ skipSensitive: e.target.checked })}
          />
          <span className="text-sm leading-snug text-gray-300">
            {t('settings.capture.skipSensitive')}
            <span className="block text-xs text-gray-500 mt-0.5">
              {t('settings.capture.skipSensitive.hint')}
            </span>
          </span>
        </label>
      </Group>
    </div>
  );
}

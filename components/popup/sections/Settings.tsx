import React, { useEffect, useState } from 'react';
import type { Settings } from '@/lib/storage/types';
import { getSettings, updateSettings } from '@/lib/storage/settings-store';
import { useI18n } from '@/lib/i18n';

const inputBase =
  'w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors';

const labelBase = 'block text-xs text-gray-400 mb-1';

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

  if (!settings) {
    return <p className="text-xs text-gray-500">{t('import.parsing')}</p>;
  }

  return (
    <div>
      <div className="mb-3">
        <label className={labelBase}>{t('settings.language')}</label>
        <select
          className={inputBase}
          value={locale}
          onChange={(e) => setLocale(e.target.value as 'zh' | 'en')}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="mb-3">
        <label className={labelBase}>{t('settings.apiProvider')}</label>
        <select
          className={inputBase}
          value={settings.apiProvider}
          onChange={(e) =>
            handleChange({ apiProvider: e.target.value as Settings['apiProvider'] })
          }
        >
          <option value="">{t('settings.apiProvider.none')}</option>
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
        </select>
      </div>
      {settings.apiProvider && (
        <div className="mb-3">
          <label className={labelBase}>{t('settings.apiKey')}</label>
          <input
            type="password"
            className={inputBase}
            value={settings.apiKey}
            onChange={(e) => handleChange({ apiKey: e.target.value })}
            placeholder="sk-..."
          />
          <p className="text-xs text-gray-600 mt-1">{t('settings.apiKeyHint')}</p>
        </div>
      )}
      {(saving || saved) && (
        <p className="text-xs text-gray-500 mt-1">
          {saving ? t('import.parsing') : '✓'}
        </p>
      )}
    </div>
  );
}

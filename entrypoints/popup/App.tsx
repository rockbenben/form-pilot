import './style.css';
import React, { useEffect, useState } from 'react';
import type { Resume } from '@/lib/storage/types';
import {
  getActiveResumeId,
  listResumes,
} from '@/lib/storage/resume-store';
import { I18nContext, useI18nProvider } from '@/lib/i18n';
import { countFields } from '@/lib/storage/resume-utils';

function openDashboard(hash?: string) {
  const url = chrome.runtime.getURL('/dashboard.html') + (hash ? '#' + hash : '');
  chrome.tabs.create({ url });
}

export default function App() {
  const i18n = useI18nProvider();
  const { t } = i18n;
  const [activeResume, setActiveResume] = useState<Resume | null>(null);
  const [filling, setFilling] = useState(false);
  const [fillResult, setFillResult] = useState<'ok' | 'err' | null>(null);

  useEffect(() => {
    async function init() {
      const [all, storedId] = await Promise.all([listResumes(), getActiveResumeId()]);
      if (all.length === 0) return;
      const resolved = storedId && all.find((r) => r.meta.id === storedId)
        ? all.find((r) => r.meta.id === storedId)!
        : all[0];
      setActiveResume(resolved);
    }
    init();
  }, []);

  async function handleFill() {
    setFilling(true);
    setFillResult(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) throw new Error('no tab');
      await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_FILL' });
      setFillResult('ok');
    } catch {
      setFillResult('err');
    } finally {
      setFilling(false);
    }
  }

  const stats = activeResume ? countFields(activeResume) : null;
  const pct = stats && stats.total > 0 ? Math.round((stats.filled / stats.total) * 100) : 0;
  const isEmpty = !stats || stats.filled === 0;

  return (
    <I18nContext.Provider value={i18n}>
    <div className="w-80 bg-gray-950 text-gray-200 flex flex-col">
      {/* Header: brand + tagline */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-baseline gap-2">
        <span className="text-base font-bold text-blue-400">⚡ {t('app.name')}</span>
        <span className="text-xs text-gray-500 truncate">{t('popup.tagline')}</span>
      </div>

      {/* Profile block */}
      <div className="px-4 py-3 border-b border-gray-800">
        {activeResume ? (
          <>
            <div className="text-xs text-gray-500 mb-1">{t('popup.currentResume')}</div>
            <div className="text-sm font-medium text-gray-100 truncate mb-2">
              {activeResume.meta.name || t('resume.default')}
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-blue-500' : 'bg-amber-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-1.5">
              {t('popup.progress', { filled: stats!.filled, total: stats!.total, pct })}
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-500">{t('popup.noResume')}</div>
        )}
      </div>

      {/* Primary action: fill */}
      <div className="px-4 pt-3 pb-2">
        <button
          onClick={handleFill}
          disabled={filling || !activeResume}
          className={`w-full py-2.5 px-3 rounded text-sm font-semibold transition-colors flex items-center justify-center gap-2
            ${activeResume
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }
            ${filling ? 'opacity-60 cursor-wait' : ''}`}
        >
          <span>⚡</span>
          <span>{filling ? '...' : t('popup.fill')}</span>
        </button>
        {fillResult === 'ok' && (
          <p className="text-xs text-green-400 text-center mt-2">{t('popup.fill.success')}</p>
        )}
        {fillResult === 'err' && (
          <p className="text-xs text-red-400 text-center mt-2 leading-snug">{t('popup.fill.error')}</p>
        )}
      </div>

      {/* Secondary actions: edit + settings */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          onClick={() => openDashboard()}
          className="flex-1 py-2 px-3 rounded text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors flex items-center justify-center gap-1.5"
        >
          <span>📝</span>
          <span>{t('popup.edit')}</span>
        </button>
        <button
          onClick={() => openDashboard('settings')}
          title={t('popup.settingsOpen')}
          className="flex-1 py-2 px-3 rounded text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors flex items-center justify-center gap-1.5"
        >
          <span>⚙️</span>
          <span>{t('nav.settings')}</span>
        </button>
      </div>

      {/* First-time hint (shown only when the profile is fresh) */}
      {isEmpty && (
        <div className="mx-4 mb-3 px-3 py-2 bg-blue-950/40 border border-blue-900/60 rounded text-xs text-blue-300 leading-relaxed">
          <span className="font-semibold">💡 </span>
          {t('popup.hint.firstTime')}
        </div>
      )}
    </div>
    </I18nContext.Provider>
  );
}

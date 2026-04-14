import './style.css';
import React, { useEffect, useState } from 'react';
import type { Resume } from '@/lib/storage/types';
import {
  getActiveResumeId,
  listResumes,
} from '@/lib/storage/resume-store';
import { I18nContext, useI18nProvider } from '@/lib/i18n';
import { countFields } from '@/lib/storage/resume-utils';

// ─── Open dashboard helper ────────────────────────────────────────────────────

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

  return (
    <I18nContext.Provider value={i18n}>
    <div className="w-72 bg-gray-950 text-gray-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="text-sm font-bold text-blue-400">{t('app.name')}</span>
        <button
          onClick={() => openDashboard('settings')}
          title={t('nav.settings')}
          className="text-gray-500 hover:text-gray-200 transition-colors text-base leading-none"
        >
          ⚙
        </button>
      </div>

      {/* Active resume info */}
      <div className="px-4 py-3 border-b border-gray-800">
        {activeResume ? (
          <>
            <div className="text-xs text-gray-400 mb-1">{t('popup.currentResume')}</div>
            <div className="text-sm font-medium text-gray-100 truncate mb-2">
              {activeResume.meta.name || t('resume.default')}
            </div>
            {/* Progress bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 shrink-0">{pct}%</span>
            </div>
            {stats && (
              <div className="text-xs text-gray-600 mt-1">
                {stats.filled}/{stats.total} {t('status.fields')}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-gray-500">{t('popup.noResume')}</div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 flex flex-col gap-2">
        <button
          onClick={() => openDashboard()}
          className="w-full py-2 px-3 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          {t('popup.manage')}
        </button>
        <button
          onClick={handleFill}
          disabled={filling || !activeResume}
          className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors
            ${activeResume
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-200'
              : 'bg-gray-900 text-gray-600 cursor-not-allowed'
            }
            ${filling ? 'opacity-60 cursor-wait' : ''}`}
        >
          {filling ? '...' : t('popup.fill')}
        </button>

        {fillResult === 'ok' && (
          <p className="text-xs text-green-400 text-center">{t('popup.fill.success')}</p>
        )}
        {fillResult === 'err' && (
          <p className="text-xs text-red-400 text-center">{t('popup.fill.error')}</p>
        )}
      </div>
    </div>
    </I18nContext.Provider>
  );
}

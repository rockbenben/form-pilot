import './style.css';
import React, { useEffect, useState } from 'react';
import type { Resume } from '@/lib/storage/types';
import { resolveActiveResume } from '@/lib/storage/resume-store';
import { I18nContext, useI18nProvider } from '@/lib/i18n';
import { countFields } from '@/lib/storage/resume-utils';
import { getSettings, updateSettings } from '@/lib/storage/settings-store';
import { resolveSiteOverride, resolveSiteOverrideKey, safeHostname } from '@/lib/capture/domain-match';
import { STATUS_COLORS, STATUS_ICONS } from '@/lib/ui/field-status';

function openDashboard(hash?: string) {
  const url = chrome.runtime.getURL('/dashboard.html') + (hash ? '#' + hash : '');
  chrome.tabs.create({ url });
}

/**
 * What survives the content-script → popup message hop. `FillResult.items`
 * carries live `Element` references, which do not serialize, so the popup
 * deliberately types only the counts rather than importing `FillResult` and
 * pretending the elements arrived.
 */
interface FillSummary {
  filled: number;
  uncertain: number;
  empty: number;
  unrecognized: number;
}

type SaveType = 'draft' | 'writeback' | 'memory';

/**
 * Short labels, no icons.
 *
 * These buttons used to reuse `capture.menu.*`, written for the toolbar's
 * full-width dropdown. Each of those strings already begins with an emoji, and
 * the grid added a second one, so every button showed two — then `truncate`
 * cut the text at three columns of ~90px and two of the three buttons read
 * identically as「保存...」. Three distinct leading characters and no icon
 * fit the column without truncating at all.
 */
const SAVE_ACTIONS: Array<{ type: SaveType; labelKey: string }> = [
  { type: 'draft', labelKey: 'popup.save.draft' },
  { type: 'writeback', labelKey: 'popup.save.writeback' },
  { type: 'memory', labelKey: 'popup.save.memory' },
];

/** All counts are tabular so a digit change never shifts the layout. */
const NUM = 'tabular-nums';

interface Segment {
  key: string;
  n: number;
  color: string;
  icon: string;
  labelKey: string;
}

/**
 * The signature element: one bar with two readings.
 *
 * Before a fill it is the profile's completeness. After a fill it re-renders
 * as that fill's outcome, in the colours FormPilot painted onto the page's own
 * fields a moment earlier — so the summary here and the highlighting there are
 * the same language rather than two unrelated reports of one event.
 */
function StatusBar({ segments, t }: { segments: Segment[]; t: (k: string) => string }) {
  const total = segments.reduce((s, x) => s + x.n, 0);
  return (
    <>
      <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-gray-800">
        {total === 0 ? null : segments.map((s) =>
          s.n === 0 ? null : (
            <div
              key={s.key}
              style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.color }}
              className="h-full first:rounded-l-full last:rounded-r-full"
            />
          ),
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <span key={s.key} className="flex items-baseline gap-1 text-xs">
            <span aria-hidden className="text-[10px]">{s.icon}</span>
            <span className={`font-semibold ${NUM}`} style={{ color: s.color }}>{s.n}</span>
            <span className="text-gray-500">{t(s.labelKey)}</span>
          </span>
        ))}
      </div>
    </>
  );
}

export default function App() {
  const i18n = useI18nProvider();
  const { t } = i18n;
  const [activeResume, setActiveResume] = useState<Resume | null>(null);
  const [filling, setFilling] = useState(false);
  const [fillResult, setFillResult] = useState<FillSummary | null>(null);
  const [fillError, setFillError] = useState(false);
  const [saving, setSaving] = useState<SaveType | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [disabledDomain, setDisabledDomain] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      // Same resolver the fill path uses, so the profile shown here is always
      // the profile that will actually be filled from.
      setActiveResume(await resolveActiveResume());

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const host = safeHostname(tab?.url ?? '');
      if (host) {
        const s = await getSettings();
        if (resolveSiteOverride(host, s.siteOverrides) === 'never') setDisabledDomain(host);
      }
    }
    init();
  }, []);

  async function handleUndoDisable() {
    if (!disabledDomain) return;
    const s = await getSettings();
    const next = { ...s.siteOverrides };
    // Remove only the one key actually responsible for the banner (the
    // longest suffix match) — the rule may have been written against a
    // parent domain, but a sibling `'always'` rule on that same parent
    // must survive.
    const key = resolveSiteOverrideKey(disabledDomain, next);
    if (key !== undefined) delete next[key];
    await updateSettings({ siteOverrides: next });
    setDisabledDomain(null);
  }

  async function handleFill() {
    setFilling(true);
    setFillResult(null);
    setFillError(false);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) throw new Error('no tab');
      // The content script returns the real counts. Reporting a flat "done"
      // regardless made this panel contradict the in-page toolbar, which was
      // showing the actual tally at the same moment.
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_FILL' });
      if (!res?.ok || !res.data) throw new Error('no result');
      setFillResult(res.data as FillSummary);
    } catch {
      setFillError(true);
    } finally {
      setFilling(false);
    }
  }

  async function handleSave(type: SaveType) {
    setSaving(type);
    setSaveMsg(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) throw new Error('no tab');
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_SAVE', save: type });
      setSaveMsg(res?.ok && res.msg ? String(res.msg) : t('popup.fill.error'));
    } catch {
      setSaveMsg(t('popup.fill.error'));
    } finally {
      setSaving(null);
    }
  }

  const stats = activeResume ? countFields(activeResume) : null;
  const isEmpty = !stats || stats.filled === 0;

  const profileSegments: Segment[] = stats
    ? [
        { key: 'filled', n: stats.filled, color: STATUS_COLORS.filled, icon: STATUS_ICONS.filled, labelKey: 'popup.stat.filled' },
        { key: 'missing', n: stats.total - stats.filled, color: STATUS_COLORS.empty, icon: STATUS_ICONS.empty, labelKey: 'popup.stat.missing' },
      ]
    : [];

  const resultSegments: Segment[] = fillResult
    ? [
        { key: 'filled', n: fillResult.filled, color: STATUS_COLORS.filled, icon: STATUS_ICONS.filled, labelKey: 'popup.stat.filled' },
        { key: 'uncertain', n: fillResult.uncertain, color: STATUS_COLORS.uncertain, icon: STATUS_ICONS.uncertain, labelKey: 'popup.stat.uncertain' },
        { key: 'missing', n: fillResult.empty, color: STATUS_COLORS.empty, icon: STATUS_ICONS.empty, labelKey: 'popup.stat.missing' },
      ]
    : [];

  const showingResult = fillResult !== null;
  const resultTotal = resultSegments.reduce((s, x) => s + x.n, 0);

  return (
    <I18nContext.Provider value={i18n}>
    <div className="w-80 bg-gray-950 text-gray-200 flex flex-col">
      {/* Header: brand + tagline */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-baseline gap-2">
        <span className="text-base font-bold text-blue-400">⚡ {t('app.name')}</span>
        <span className="text-xs text-gray-500 truncate">{t('popup.tagline')}</span>
      </div>

      {disabledDomain && (
        <div className="mx-4 mt-3 px-3 py-2 bg-amber-950/40 border border-amber-900/60 rounded text-xs text-amber-300 flex items-center justify-between gap-2">
          <span className="truncate">{t('popup.siteDisabled')}</span>
          <button onClick={handleUndoDisable} className="underline shrink-0 hover:text-amber-200">
            {t('popup.siteDisabled.undo')}
          </button>
        </div>
      )}

      {/* Profile + status. One bar, two readings — see StatusBar. */}
      <div className="px-4 py-3 border-b border-gray-800">
        {activeResume ? (
          <>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-gray-100 truncate">
                {activeResume.meta.name || t('resume.default')}
              </span>
              <span className="text-[11px] text-gray-500 shrink-0">
                {showingResult ? t('popup.result.title') : t('popup.currentResume')}
              </span>
            </div>
            <StatusBar segments={showingResult ? resultSegments : profileSegments} t={t} />
          </>
        ) : (
          <div className="text-xs text-gray-500">{t('popup.noResume')}</div>
        )}
      </div>

      {/* Primary action */}
      <div className="px-4 pt-3">
        <button
          onClick={handleFill}
          disabled={filling || !activeResume}
          className={`w-full py-2.5 px-3 rounded text-sm font-semibold transition-colors
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400
            ${activeResume
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }
            ${filling ? 'opacity-60 cursor-wait' : ''}`}
        >
          {filling ? t('popup.filling') : t('popup.fill')}
        </button>
        {/* A fill that matched nothing renders three zeros and an empty bar,
            which states the outcome but not what it means. Say it. */}
        {showingResult && resultTotal === 0 && (
          <p className="mt-2 text-xs text-gray-400 leading-snug">{t('popup.fill.none')}</p>
        )}
        {showingResult && fillResult.empty > 0 && (
          <p className="mt-2 text-xs text-blue-300 leading-snug">
            {t('popup.fill.empty', { n: fillResult.empty })}
          </p>
        )}
        {fillError && (
          <p className="mt-2 text-xs text-red-400 leading-snug">{t('popup.fill.error')}</p>
        )}
      </div>

      {/* Save actions — same three the toolbar's save menu offers, reachable
          without the toolbar being on screen. */}
      <div className="px-4 pt-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5">
          {t('popup.save.group')}
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {SAVE_ACTIONS.map((a) => (
            <button
              key={a.type}
              onClick={() => handleSave(a.type)}
              disabled={saving !== null}
              className={`py-1.5 px-1 rounded text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200
                transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400
                ${saving !== null ? 'opacity-60 cursor-wait' : ''}`}
            >
              {t(a.labelKey)}
            </button>
          ))}
        </div>
        {saveMsg && <p className="mt-1.5 text-xs text-gray-400">{saveMsg}</p>}
      </div>

      {/* Navigation, not actions — these leave the popup and open a tab, so
          they are quieter than the buttons above and sit below a rule. Filled
          in the same grey, they read as a fourth and fifth way to act on this
          page, which is what made the panel hard to scan. */}
      <div className="mt-4 px-4 py-2.5 border-t border-gray-800 flex gap-1.5">
        <button
          onClick={() => openDashboard()}
          className="flex-1 py-1.5 px-3 rounded text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800/70
            transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
        >
          {t('popup.edit')}
        </button>
        <button
          onClick={() => openDashboard('settings')}
          className="flex-1 py-1.5 px-3 rounded text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800/70
            transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
        >
          {t('nav.settings')}
        </button>
      </div>

      {/* First-run guidance, shown only while the profile is still empty. */}
      {isEmpty && (
        <div className="mx-4 mb-4 px-3 py-2 bg-blue-950/40 border border-blue-900/60 rounded text-xs text-blue-300 leading-relaxed">
          {t('popup.hint.firstTime')}
        </div>
      )}
    </div>
    </I18nContext.Provider>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import type { DraftSnapshot, PageMemoryEntry, CapturedField } from '@/lib/capture/types';
import type { FormEntry } from '@/lib/storage/form-store';
import { useI18n } from '@/lib/i18n';
import { formatRelativeTime } from '@/lib/capture/time-format';
import { MULTI_VALUE_SEPARATOR } from '@/lib/capture/element-value';

type SubTab = 'drafts' | 'memory' | 'form';

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Render a form-pilot value for display — unpacks multi-select separator. */
function displayValue(v: string): string {
  if (!v) return '—';
  if (v.includes(MULTI_VALUE_SEPARATOR)) return v.split(MULTI_VALUE_SEPARATOR).join(' / ');
  return v;
}

function FieldTable({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) {
    return <div className="text-gray-500 text-xs py-2">—</div>;
  }
  return (
    <div className="mt-1 bg-gray-900 border border-gray-800 rounded p-2 space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2 text-xs">
          <span className="text-gray-500 shrink-0 w-32 truncate" title={r.label}>
            {r.label || '—'}
          </span>
          <span className="text-gray-300 break-all" title={r.value}>
            {truncate(displayValue(r.value), 200)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SavedPagesSection() {
  const { t } = useI18n();
  const [tab, setTab] = useState<SubTab>('drafts');
  const [drafts, setDrafts] = useState<DraftSnapshot[]>([]);
  const [memory, setMemory] = useState<Record<string, PageMemoryEntry[]>>({});
  const [formEntries, setFormEntries] = useState<Record<string, FormEntry>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const [d, m, f] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'LIST_DRAFTS' }),
      chrome.runtime.sendMessage({ type: 'LIST_PAGE_MEMORY' }),
      chrome.runtime.sendMessage({ type: 'LIST_FORM_ENTRIES' }),
    ]);
    setDrafts(d?.ok ? (d.data as DraftSnapshot[]) : []);
    setMemory(m?.ok ? (m.data as Record<string, PageMemoryEntry[]>) : {});
    setFormEntries(f?.ok ? (f.data as Record<string, FormEntry>) : {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const deleteDraft = async (url: string) => {
    await chrome.runtime.sendMessage({ type: 'DELETE_DRAFT', url });
    refresh();
  };
  const deleteMemory = async (url: string) => {
    await chrome.runtime.sendMessage({ type: 'DELETE_PAGE_MEMORY', url });
    refresh();
  };
  const deleteFormEntry = async (signature: string) => {
    await chrome.runtime.sendMessage({ type: 'DELETE_FORM_ENTRY', signature });
    refresh();
  };
  const clearAllFormEntries = async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_FORM_ENTRIES' });
    refresh();
  };

  const now = Date.now();

  const draftRows = (fields: CapturedField[]) =>
    fields.map((f) => ({ label: f.label, value: f.displayValue || f.value }));

  const memoryRows = (entries: PageMemoryEntry[]) =>
    entries.map((e) => ({ label: e.signature, value: e.value }));

  // Sort form entries by hitCount desc, then updatedAt desc
  const sortedFormEntries = Object.values(formEntries).sort((a, b) => {
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <div className="text-sm">
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setTab('drafts')}
          className={`px-3 py-1 rounded ${tab === 'drafts' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400'}`}
        >
          {t('savedPages.drafts.title')} ({drafts.length})
        </button>
        <button
          onClick={() => setTab('memory')}
          className={`px-3 py-1 rounded ${tab === 'memory' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400'}`}
        >
          {t('savedPages.memory.title')} ({Object.keys(memory).length})
        </button>
        <button
          onClick={() => setTab('form')}
          className={`px-3 py-1 rounded ${tab === 'form' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400'}`}
        >
          {t('savedPages.form.title')} ({sortedFormEntries.length})
        </button>
      </div>

      {tab === 'drafts' && (
        drafts.length === 0 ? (
          <div className="text-gray-500">{t('savedPages.drafts.empty')}</div>
        ) : (
          <table className="w-full">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left p-1">{t('savedPages.column.url')}</th>
                <th className="text-left p-1">{t('savedPages.column.savedAt')}</th>
                <th className="text-left p-1">{t('savedPages.column.fields')}</th>
                <th className="text-left p-1">{t('savedPages.column.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => {
                const key = `draft:${d.url}`;
                const isOpen = expanded.has(key);
                return (
                  <React.Fragment key={d.url}>
                    <tr className="border-t border-gray-800">
                      <td className="p-1 truncate max-w-xs" title={d.url}>{d.url}</td>
                      <td className="p-1">{formatRelativeTime(d.savedAt, now, t)}</td>
                      <td className="p-1">{d.fields.length}</td>
                      <td className="p-1 space-x-2">
                        <button
                          onClick={() => toggleExpand(key)}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {t('savedPages.action.view')}
                        </button>
                        <button
                          onClick={() => deleteDraft(d.url)}
                          className="text-red-400 hover:text-red-300"
                        >
                          {t('savedPages.action.delete')}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={4} className="p-1">
                          <FieldTable rows={draftRows(d.fields)} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )
      )}

      {tab === 'memory' && (
        Object.keys(memory).length === 0 ? (
          <div className="text-gray-500">{t('savedPages.memory.empty')}</div>
        ) : (
          <table className="w-full">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left p-1">{t('savedPages.column.url')}</th>
                <th className="text-left p-1">{t('savedPages.column.fields')}</th>
                <th className="text-left p-1">{t('savedPages.column.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(memory).map(([url, entries]) => {
                const key = `memory:${url}`;
                const isOpen = expanded.has(key);
                return (
                  <React.Fragment key={url}>
                    <tr className="border-t border-gray-800">
                      <td className="p-1 truncate max-w-xs" title={url}>{url}</td>
                      <td className="p-1">{entries.length}</td>
                      <td className="p-1 space-x-2">
                        <button
                          onClick={() => toggleExpand(key)}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {t('savedPages.action.view')}
                        </button>
                        <button
                          onClick={() => deleteMemory(url)}
                          className="text-red-400 hover:text-red-300"
                        >
                          {t('savedPages.action.delete')}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={3} className="p-1">
                          <FieldTable rows={memoryRows(entries)} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )
      )}

      {tab === 'form' && (
        sortedFormEntries.length === 0 ? (
          <div className="text-gray-500">{t('savedPages.form.empty')}</div>
        ) : (
          <>
            <div className="flex justify-end mb-2">
              <button
                onClick={clearAllFormEntries}
                className="text-xs px-2 py-1 text-red-400 hover:text-red-300 border border-red-900/40 rounded"
              >
                {t('savedPages.form.clearAll')}
              </button>
            </div>
            <table className="w-full">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="text-left p-1">{t('savedPages.form.column.label')}</th>
                  <th className="text-left p-1">{t('savedPages.form.column.value')}</th>
                  <th className="text-left p-1">{t('savedPages.form.column.hits')}</th>
                  <th className="text-left p-1">{t('savedPages.form.column.source')}</th>
                  <th className="text-left p-1">{t('savedPages.column.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedFormEntries.map((e) => (
                  <tr key={e.signature} className="border-t border-gray-800">
                    <td className="p-1 truncate max-w-[160px]" title={e.label}>
                      {e.label || '—'}
                    </td>
                    <td className="p-1 truncate max-w-[200px]" title={displayValue(e.displayValue || e.value)}>
                      {truncate(displayValue(e.displayValue || e.value), 60)}
                    </td>
                    <td className="p-1 text-xs text-gray-500">{e.hitCount}</td>
                    <td className="p-1 text-xs text-gray-500 truncate max-w-[200px]" title={e.lastUrl}>
                      {e.lastUrl}
                    </td>
                    <td className="p-1">
                      <button
                        onClick={() => deleteFormEntry(e.signature)}
                        className="text-red-400 hover:text-red-300"
                      >
                        {t('savedPages.action.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import type { DraftSnapshot, PageMemoryEntry, CapturedField } from '@/lib/capture/types';
import type { FormEntry, FieldCandidate } from '@/lib/storage/form-store';
import type { FieldDomainPrefs } from '@/lib/storage/domain-prefs-store';
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

function pickDefault(entry: FormEntry): FieldCandidate | null {
  if (entry.candidates.length === 0) return null;
  if (entry.pinnedId) {
    const pinned = entry.candidates.find((c) => c.id === entry.pinnedId);
    if (pinned) return pinned;
  }
  return [...entry.candidates].sort((a, b) => {
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.createdAt - b.createdAt;
  })[0];
}

export default function SavedPagesSection() {
  const { t } = useI18n();
  const [tab, setTab] = useState<SubTab>('drafts');
  const [drafts, setDrafts] = useState<DraftSnapshot[]>([]);
  const [memory, setMemory] = useState<Record<string, PageMemoryEntry[]>>({});
  const [formEntries, setFormEntries] = useState<Record<string, FormEntry>>({});
  const [domainPrefs, setDomainPrefs] = useState<FieldDomainPrefs>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const [d, m, f, dp] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'LIST_DRAFTS' }),
      chrome.runtime.sendMessage({ type: 'LIST_PAGE_MEMORY' }),
      chrome.runtime.sendMessage({ type: 'LIST_FORM_ENTRIES' }),
      chrome.runtime.sendMessage({ type: 'LIST_DOMAIN_PREFS' }),
    ]);
    setDrafts(d?.ok ? (d.data as DraftSnapshot[]) : []);
    setMemory(m?.ok ? (m.data as Record<string, PageMemoryEntry[]>) : {});
    setFormEntries(f?.ok ? (f.data as Record<string, FormEntry>) : {});
    setDomainPrefs(dp?.ok ? (dp.data as FieldDomainPrefs) : {});
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
  const clearAllFormEntries = async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_FORM_ENTRIES' });
    refresh();
  };

  const now = Date.now();

  const draftRows = (fields: CapturedField[]) =>
    fields.map((f) => ({ label: f.label, value: f.displayValue || f.value }));

  const memoryRows = (entries: PageMemoryEntry[]) =>
    entries.map((e) => ({ label: e.signature, value: e.value }));

  const sortedFormEntries = Object.values(formEntries).sort((a, b) => {
    const ad = pickDefault(a), bd = pickDefault(b);
    if ((bd?.hitCount ?? 0) !== (ad?.hitCount ?? 0)) return (bd?.hitCount ?? 0) - (ad?.hitCount ?? 0);
    return (bd?.updatedAt ?? 0) - (ad?.updatedAt ?? 0);
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
            <div className="space-y-2">
              {sortedFormEntries.map((e) => {
                const key = `form:${e.signature}`;
                const isOpen = expanded.has(key);
                const def = pickDefault(e);
                const defText = def ? displayValue(def.displayValue ?? def.value) : '—';
                const domains = domainPrefs[e.signature] ?? {};
                return (
                  <div key={e.signature} className="border border-gray-800 rounded">
                    <button
                      className="w-full text-left p-2 flex items-center justify-between hover:bg-gray-800/40"
                      onClick={() => toggleExpand(key)}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate" title={e.label}>{e.label || '—'}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {t('candidate.dashboard.defaultLabel', { value: truncate(defText, 60) })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
                        <span>{t('candidate.dashboard.candidatesCount', { n: String(e.candidates.length) })}</span>
                        {e.pinnedId && <span title={t('candidate.picker.pin')}>★</span>}
                      </div>
                    </button>
                    {isOpen && (
                      <FormEntryPanel
                        entry={e}
                        domains={domains}
                        onChanged={refresh}
                        now={now}
                        t={t}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )
      )}
    </div>
  );
}

function FormEntryPanel({
  entry, domains, onChanged, now, t,
}: {
  entry: FormEntry;
  domains: Record<string, string>;
  onChanged: () => void;
  now: number;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const [adding, setAdding] = React.useState(false);
  const [addValue, setAddValue] = React.useState('');
  const [addDisplayValue, setAddDisplayValue] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [editDisplayValue, setEditDisplayValue] = React.useState('');
  const needsDisplay = entry.kind === 'radio' || entry.kind === 'select';

  const deleteCandidate = async (candidateId: string) => {
    await chrome.runtime.sendMessage({ type: 'DELETE_FORM_CANDIDATE', signature: entry.signature, candidateId });
    onChanged();
  };
  const togglePin = async (candidateId: string) => {
    const next = entry.pinnedId === candidateId ? null : candidateId;
    await chrome.runtime.sendMessage({ type: 'SET_FORM_PIN', signature: entry.signature, candidateId: next });
    onChanged();
  };
  const submitAdd = async () => {
    if (!addValue && !addDisplayValue) return;
    await chrome.runtime.sendMessage({
      type: 'ADD_FORM_CANDIDATE',
      signature: entry.signature,
      value: addValue,
      displayValue: needsDisplay ? addDisplayValue : undefined,
    });
    setAdding(false); setAddValue(''); setAddDisplayValue('');
    onChanged();
  };
  const beginEdit = (c: FieldCandidate) => {
    setEditingId(c.id);
    setEditValue(c.value);
    setEditDisplayValue(c.displayValue ?? '');
  };
  const submitEdit = async (candidateId: string) => {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_FORM_CANDIDATE',
      signature: entry.signature,
      candidateId,
      value: editValue,
      displayValue: needsDisplay ? editDisplayValue : undefined,
    });
    setEditingId(null);
    onChanged();
  };
  const clearDomainOverride = async (domain: string) => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_DOMAIN_PREF', signature: entry.signature, domain });
    onChanged();
  };

  return (
    <div className="border-t border-gray-800 p-2 space-y-3">
      <div className="space-y-1">
        {entry.candidates.map((c) => {
          const editing = editingId === c.id;
          return (
            <div key={c.id} className="flex items-start gap-2 text-xs py-1">
              <div className="flex-1 min-w-0">
                {editing ? (
                  <div className="space-y-1">
                    <input
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1"
                      value={editValue} onChange={(ev) => setEditValue(ev.target.value)}
                      placeholder={t('candidate.dashboard.valuePlaceholder')}
                    />
                    {needsDisplay && (
                      <input
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1"
                        value={editDisplayValue} onChange={(ev) => setEditDisplayValue(ev.target.value)}
                        placeholder={t('candidate.dashboard.displayValuePlaceholder')}
                      />
                    )}
                    <div className="flex gap-2">
                      <button className="text-blue-400" onClick={() => submitEdit(c.id)}>
                        {t('candidate.dashboard.save')}
                      </button>
                      <button className="text-gray-400" onClick={() => setEditingId(null)}>
                        {t('candidate.dashboard.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-gray-200 break-all">
                      {c.displayValue ?? c.value}
                    </div>
                    <div className="text-gray-500">
                      {t('candidate.picker.lastSeen', { domain: c.lastUrl || '—' })} ·{' '}
                      {t('candidate.picker.hitCountLabel', { n: String(c.hitCount) })} ·{' '}
                      {formatRelativeTime(c.updatedAt, now, t)}
                    </div>
                  </>
                )}
              </div>
              {!editing && (
                <div className="flex gap-2 shrink-0 text-gray-400">
                  <button title={t('candidate.dashboard.editValue')} onClick={() => beginEdit(c)}>✎</button>
                  <button
                    title={entry.pinnedId === c.id ? t('candidate.picker.unpin') : t('candidate.picker.pin')}
                    onClick={() => togglePin(c.id)}
                  >
                    {entry.pinnedId === c.id ? '★' : '☆'}
                  </button>
                  <button
                    title={t('candidate.picker.delete')}
                    onClick={() => deleteCandidate(c.id)}
                    className="text-red-400 hover:text-red-300"
                  >🗑</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="space-y-1">
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
            value={addValue} onChange={(ev) => setAddValue(ev.target.value)}
            placeholder={t('candidate.dashboard.valuePlaceholder')}
          />
          {needsDisplay && (
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
              value={addDisplayValue} onChange={(ev) => setAddDisplayValue(ev.target.value)}
              placeholder={t('candidate.dashboard.displayValuePlaceholder')}
            />
          )}
          <div className="flex gap-2 text-xs">
            <button className="text-blue-400" onClick={submitAdd}>{t('candidate.dashboard.save')}</button>
            <button className="text-gray-400" onClick={() => { setAdding(false); setAddValue(''); setAddDisplayValue(''); }}>{t('candidate.dashboard.cancel')}</button>
          </div>
        </div>
      ) : (
        <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => setAdding(true)}>
          + {t('candidate.dashboard.addCandidate')}
        </button>
      )}

      {Object.keys(domains).length > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <div className="text-xs text-gray-500 mb-1">
            {t('candidate.dashboard.domainOverrides')}
          </div>
          <div className="space-y-1">
            {Object.entries(domains).map(([domain, candidateId]) => {
              const cand = entry.candidates.find((c) => c.id === candidateId);
              return (
                <div key={domain} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">
                    {domain} → {cand ? (cand.displayValue ?? cand.value) : '(missing)'}
                  </span>
                  <button
                    className="text-red-400 hover:text-red-300"
                    title={t('candidate.picker.delete')}
                    onClick={() => clearDomainOverride(domain)}
                  >🗑</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

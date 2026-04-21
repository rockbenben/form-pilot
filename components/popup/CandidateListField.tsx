// components/popup/CandidateListField.tsx
import React, { useState } from 'react';
import type { FieldCandidate } from '@/lib/capture/candidate';
import { useI18n } from '@/lib/i18n';

export interface CandidateListFieldProps {
  label: string;
  candidates: FieldCandidate[];
  pinnedId: string | null;
  domainPrefs: Record<string, string>;
  valueInputPlaceholder: string;
  onAdd: (value: string, label: string) => void;
  onUpdate: (id: string, value: string, label: string) => void;
  onDelete: (id: string) => void;
  onSetPin: (id: string | null) => void;
  onClearDomainPref: (domain: string) => void;
}

/** Tiebreak sort matching resolveCandidate's step 3-5 (no domain context). */
function pickDefault(candidates: FieldCandidate[], pinnedId: string | null): FieldCandidate | null {
  if (candidates.length === 0) return null;
  if (pinnedId) {
    const p = candidates.find((c) => c.id === pinnedId);
    if (p) return p;
  }
  return [...candidates].sort((a, b) => {
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.createdAt - b.createdAt;
  })[0];
}

export default function CandidateListField({
  label, candidates, pinnedId, domainPrefs,
  valueInputPlaceholder,
  onAdd, onUpdate, onDelete, onSetPin, onClearDomainPref,
}: CandidateListFieldProps) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');

  const def = pickDefault(candidates, pinnedId);

  const resetAdd = () => { setAdding(false); setAddValue(''); setAddLabel(''); };
  const submitAdd = () => {
    if (!addValue.trim()) return;
    onAdd(addValue.trim(), addLabel.trim());
    resetAdd();
  };
  const beginEdit = (c: FieldCandidate) => {
    setEditingId(c.id);
    setEditValue(c.value);
    setEditLabel(c.label ?? '');
  };
  const submitEdit = (id: string) => {
    if (!editValue.trim()) return;
    onUpdate(id, editValue.trim(), editLabel.trim());
    setEditingId(null);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-500">{label}</label>
        {!adding && (
          <button
            className="text-xs text-blue-400 hover:text-blue-300"
            onClick={() => setAdding(true)}
          >
            {t('profile.candidate.add')}
          </button>
        )}
      </div>

      {candidates.length === 0 && !adding && (
        <div className="text-xs text-gray-500 italic">
          {t('profile.candidate.noCandidates')}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="space-y-1 bg-gray-900 border border-gray-800 rounded p-1">
          {candidates.map((c) => {
            const isEditing = editingId === c.id;
            const isDefault = def?.id === c.id;
            const isPinned = pinnedId === c.id;
            return (
              <div key={c.id} className="flex items-start gap-2 text-xs py-1 px-1">
                {!isEditing && (
                  <span className="text-gray-500 mt-0.5">{isDefault ? '●' : '○'}</span>
                )}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-1">
                      <input
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                        value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        placeholder={valueInputPlaceholder}
                      />
                      <input
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                        value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
                        placeholder={t('profile.candidate.labelPlaceholder')}
                      />
                      <div className="flex gap-2">
                        <button className="text-blue-400" onClick={() => submitEdit(c.id)}>
                          {t('profile.candidate.save')}
                        </button>
                        <button className="text-gray-400" onClick={() => setEditingId(null)}>
                          {t('profile.candidate.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-gray-200 break-all">{c.value}</div>
                      {c.label && <div className="text-gray-500">{c.label}</div>}
                    </>
                  )}
                </div>
                {!isEditing && (
                  <div className="flex gap-2 shrink-0 text-gray-400">
                    <button
                      title={isPinned ? 'Unpin' : 'Pin'}
                      onClick={() => onSetPin(isPinned ? null : c.id)}
                    >{isPinned ? '★' : '☆'}</button>
                    <button title="Edit" onClick={() => beginEdit(c)}>✎</button>
                    <button
                      title="Delete"
                      onClick={() => onDelete(c.id)}
                      className="text-red-400 hover:text-red-300"
                    >🗑</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="mt-1 space-y-1 bg-gray-900 border border-gray-800 rounded p-2">
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
            value={addValue} onChange={(e) => setAddValue(e.target.value)}
            placeholder={valueInputPlaceholder}
            autoFocus
          />
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
            value={addLabel} onChange={(e) => setAddLabel(e.target.value)}
            placeholder={t('profile.candidate.labelPlaceholder')}
          />
          <div className="flex gap-2 text-xs">
            <button className="text-blue-400" onClick={submitAdd}>
              {t('profile.candidate.save')}
            </button>
            <button className="text-gray-400" onClick={resetAdd}>
              {t('profile.candidate.cancel')}
            </button>
          </div>
        </div>
      )}

      {Object.keys(domainPrefs).length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-800 text-xs">
          <div className="text-gray-500 mb-1">Domain overrides</div>
          <div className="space-y-1">
            {Object.entries(domainPrefs).map(([domain, candidateId]) => {
              const c = candidates.find((x) => x.id === candidateId);
              return (
                <div key={domain} className="flex items-center justify-between">
                  <span className="text-gray-300">
                    {domain} → {c ? (c.label ? `${c.value} (${c.label})` : c.value) : '(missing)'}
                  </span>
                  <button
                    className="text-red-400 hover:text-red-300"
                    title="Clear"
                    onClick={() => onClearDomainPref(domain)}
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

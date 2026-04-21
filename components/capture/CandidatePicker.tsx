// components/capture/CandidatePicker.tsx
import React, { useState, useEffect, useRef } from 'react';
import type { FieldCandidate } from '@/lib/storage/form-store';

export interface CandidatePickerProps {
  candidates: FieldCandidate[];
  pinnedId: string | null;
  currentCandidateId: string | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onSelect: (candidateId: string) => void;
  onPinToggle: (candidateId: string) => void;
  onDelete: (candidateId: string) => void;
  onManageAll: () => void;
}

export function CandidatePicker({
  candidates, pinnedId, currentCandidateId, t,
  onSelect, onPinToggle, onDelete, onManageAll,
}: CandidatePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      const path = e.composedPath();
      if (rootRef.current && !path.includes(rootRef.current)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="Switch candidate"
        style={{
          width: 14, height: 14, lineHeight: 1, fontSize: 10,
          background: '#1f2937', color: '#d1d5db',
          border: '1px solid #4b5563', borderRadius: 7,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0,
        }}
      >▾</button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 18, left: 0, zIndex: 2147483600,
            width: 260, background: '#111827', border: '1px solid #374151',
            borderRadius: 6, padding: 4, fontSize: 12, color: '#d1d5db',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {candidates.map((c) => {
            const isCurrent = c.id === currentCandidateId;
            const isPinned = c.id === pinnedId;
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: 4 }}>
                <button
                  type="button"
                  onClick={() => { setOpen(false); onSelect(c.id); }}
                  style={{
                    flex: 1, minWidth: 0, textAlign: 'left',
                    background: 'transparent', border: 'none', color: 'inherit',
                    cursor: 'pointer', padding: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: '#9ca3af' }}>{isCurrent ? '●' : '○'}</span>
                    <span
                      style={{ color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >{c.displayValue ?? c.value}</span>
                  </div>
                  <div style={{ color: '#6b7280', paddingLeft: 16, fontSize: 11 }}>
                    {t('candidate.picker.lastSeen', { domain: c.lastUrl || '—' })} ·{' '}
                    {t('candidate.picker.hitCountLabel', { n: String(c.hitCount) })}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onPinToggle(c.id)}
                  title={isPinned ? t('candidate.picker.unpin') : t('candidate.picker.pin')}
                  style={{
                    background: 'transparent', border: 'none',
                    color: isPinned ? '#fbbf24' : '#9ca3af',
                    cursor: 'pointer', padding: 0,
                  }}
                >{isPinned ? '★' : '☆'}</button>
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  title={t('candidate.picker.delete')}
                  style={{
                    background: 'transparent', border: 'none',
                    color: '#f87171', cursor: 'pointer', padding: 0,
                  }}
                >🗑</button>
              </div>
            );
          })}
          <div style={{ borderTop: '1px solid #374151', marginTop: 4, paddingTop: 4, paddingLeft: 4 }}>
            <button
              type="button"
              onClick={onManageAll}
              style={{
                background: 'transparent', border: 'none',
                color: '#60a5fa', cursor: 'pointer', padding: 0, fontSize: 12,
              }}
            >{t('candidate.picker.manage')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

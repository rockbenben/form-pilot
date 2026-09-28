// components/capture/CandidatePicker.tsx
import React, { useState, useEffect, useRef } from 'react';
import type { FieldCandidate } from '@/lib/storage/form-store';
import { ChevronDownIcon, StarIcon, TrashIcon } from '@/lib/ui/icons';

function lastSeenDomain(url: string): string {
  if (!url || url === '(manual)') return url || '—';
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

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
    <div ref={rootRef} className="fp-scope" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label={t('candidate.picker.switch')}
        aria-expanded={open}
        className="fp-icon-btn"
        style={{ width: 22, height: 22 }}
      >
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div
          className="fp-picker-panel"
          onClick={(e) => e.stopPropagation()}
          style={{ top: 26, insetInlineStart: 0 }}
        >
          {candidates.map((c) => {
            const isCurrent = c.id === currentCandidateId;
            const isPinned = c.id === pinnedId;
            return (
              <div key={c.id} className="fp-picker-row">
                <button
                  type="button"
                  onClick={() => { setOpen(false); onSelect(c.id); }}
                  className="fp-picker-main"
                >
                  <div className="fp-picker-value">
                    <span className={isCurrent ? 'fp-dot fp-dot-on' : 'fp-dot'} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.displayValue ?? c.value}</span>
                  </div>
                  <div className="fp-picker-sub">
                    {t('candidate.picker.lastSeen', { domain: lastSeenDomain(c.lastUrl) })} ·{' '}
                    {t('candidate.picker.hitCountLabel', { n: String(c.hitCount) })}
                  </div>
                </button>
                <div className="fp-picker-actions">
                  <button
                    type="button"
                    onClick={() => onPinToggle(c.id)}
                    title={isPinned ? t('candidate.picker.unpin') : t('candidate.picker.pin')}
                    className={'fp-mini-btn' + (isPinned ? ' fp-mini-star' : '')}
                  >
                    <StarIcon size={14} filled={isPinned} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    title={t('candidate.picker.delete')}
                    className="fp-mini-btn fp-mini-warn"
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="fp-menu-sep" role="presentation" style={{ margin: '6px 0 0' }} />
          <div style={{ padding: '5px 12px' }}>
            <button type="button" onClick={onManageAll} className="fp-link-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {t('candidate.picker.manage')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

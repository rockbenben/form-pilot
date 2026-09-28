import React, { useState } from 'react';
import type { DraftSnapshot } from '@/lib/capture/types';
import { formatRelativeTime } from '@/lib/capture/time-format';
import { CloseIcon } from '@/lib/ui/icons';

interface DraftBadgeProps {
  snapshot: DraftSnapshot;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onRestore: () => Promise<{ filled: number; total: number }>;
  onRestoreAndFill: () => Promise<{ filled: number; total: number }>;
  onIgnore: () => void;
  onDelete: () => void;
}

export default function DraftBadge({
  snapshot, t, onRestore, onRestoreAndFill, onIgnore, onDelete,
}: DraftBadgeProps) {
  const [hidden, setHidden] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (hidden) return null;

  const handle = async (fn: () => Promise<{ filled: number; total: number }>) => {
    const { filled, total } = await fn();
    setStatus(t('capture.badge.restored', { filled, total }));
  };

  const time = formatRelativeTime(snapshot.savedAt, Date.now(), t);

  return (
    <div
      className="fp-scope"
      role="dialog"
      aria-label="FormPilot"
      style={{
        position: 'fixed', top: 16, insetInlineEnd: 16, zIndex: 2147483647,
        maxWidth: 360, pointerEvents: 'auto',
      }}
    >
      <div className="fp-bubble" style={{ position: 'static' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span className="fp-eyebrow">FormPilot</span>
        <button className="fp-icon-btn" style={{ width: 22, height: 22 }} onClick={() => { setHidden(true); onIgnore(); }} title={t('toolbar.close')}>
          <CloseIcon size={14} />
        </button>
      </div>
      <div style={{ margin: '2px 0 10px' }}>
        {status ?? t('capture.badge.detected', { n: snapshot.fields.length, time })}
      </div>
      {!status && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="fp-btn fp-btn-danger" onClick={() => { setHidden(true); onDelete(); }}>
            {t('capture.badge.delete')}
          </button>
          <button className="fp-btn fp-btn-text" onClick={() => { setHidden(true); onIgnore(); }}>
            {t('capture.badge.ignore')}
          </button>
          <button className="fp-btn fp-btn-text" onClick={() => handle(onRestoreAndFill)}>
            {t('capture.badge.restoreAndFill')}
          </button>
          <button className="fp-btn fp-btn-primary" onClick={() => handle(onRestore)}>
            {t('capture.badge.restore')}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

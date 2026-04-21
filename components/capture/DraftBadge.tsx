import React, { useState } from 'react';
import type { DraftSnapshot } from '@/lib/capture/types';
import { formatRelativeTime } from '@/lib/capture/time-format';

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

  const wrapStyle: React.CSSProperties = {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: 2147483647,
    backgroundColor: '#1e1e3a',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: '8px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    fontSize: '13px',
    maxWidth: '360px',
    fontFamily: 'system-ui, sans-serif',
    // Shadow host is pointer-events: none so the viewport-sized backdrop
    // doesn't steal clicks from the page; re-enable on the badge itself.
    pointerEvents: 'auto',
  };

  const btn = (bg: string): React.CSSProperties => ({
    backgroundColor: bg, color: '#fff', border: 'none',
    borderRadius: '6px', padding: '6px 10px', fontSize: '12px',
    cursor: 'pointer', marginRight: '6px', marginTop: '6px',
  });

  const closeStyle: React.CSSProperties = {
    position: 'absolute', top: '4px', right: '6px',
    background: 'none', border: 'none', color: '#9ca3af',
    fontSize: '14px', cursor: 'pointer',
  };

  const time = formatRelativeTime(snapshot.savedAt, Date.now(), t);

  const brandStyle: React.CSSProperties = {
    fontSize: '11px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: '#60a5fa',
    fontWeight: 600,
    marginBottom: '4px',
  };

  return (
    <div style={wrapStyle}>
      <button style={closeStyle} onClick={() => { setHidden(true); onIgnore(); }}>&#x2715;</button>
      <div style={brandStyle}>FormPilot</div>
      <div>
        {status ?? t('capture.badge.detected', { n: snapshot.fields.length, time })}
      </div>
      {!status && (
        <div>
          <button style={btn('#3b82f6')} onClick={() => handle(onRestore)}>
            {t('capture.badge.restore')}
          </button>
          <button style={btn('#8b5cf6')} onClick={() => handle(onRestoreAndFill)}>
            {t('capture.badge.restoreAndFill')}
          </button>
          <button style={btn('#374151')} onClick={() => { setHidden(true); onIgnore(); }}>
            {t('capture.badge.ignore')}
          </button>
          <button style={btn('#dc2626')} onClick={() => { setHidden(true); onDelete(); }}>
            {t('capture.badge.delete')}
          </button>
        </div>
      )}
    </div>
  );
}

import React from 'react';
import type { FillResult } from '@/lib/engine/adapters/types';
import { STATUS_COLORS } from '@/lib/ui/field-status';
import { STATUS_ICON, CloseIcon } from '@/lib/ui/icons';

interface ResultBubbleProps {
  result: FillResult;
  onClose: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export default function ResultBubble({ result, onClose, t }: ResultBubbleProps) {
  // Only fields FormPilot actually recognized are worth listing. An
  // `unrecognized` row is a page input that was never ours to fill — listing
  // those buried the actionable rows under noise.
  const actionableItems = result.items
    .filter((item) => item.status === 'empty' || item.status === 'uncertain')
    .slice(0, 6);

  const Stat = ({ status, n, label }: { status: keyof typeof STATUS_COLORS; n: number; label: string }) => {
    const Icon = STATUS_ICON[status];
    return (
      <span className="fp-stat" style={{ color: STATUS_COLORS[status] }} title={label}>
        <Icon size={14} />
        {n}
      </span>
    );
  };

  return (
    <div className="fp-bubble" style={{ bottom: '100%', insetInlineStart: 0, marginBottom: 8, minWidth: 200, maxWidth: 280 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="fp-bubble-title">{t('toolbar.result')}</span>
        <button className="fp-icon-btn" style={{ width: 22, height: 22 }} onClick={onClose} title={t('import.close')}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <Stat status="filled" n={result.filled} label={t('toolbar.filled')} />
        <Stat status="uncertain" n={result.uncertain} label={t('toolbar.uncertain')} />
        <Stat status="empty" n={result.empty} label={t('toolbar.empty')} />
      </div>

      {result.empty > 0 && (
        <div className="fp-picker-sub" style={{ paddingInlineStart: 0, marginBottom: 8 }}>
          {t('toolbar.empty.hint')}
        </div>
      )}

      {actionableItems.length > 0 && (
        <>
          <div className="fp-menu-sep" style={{ margin: '4px 0 8px' }} />
          {actionableItems.map((item, i) => {
            const Icon = STATUS_ICON[item.status];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, fontSize: 12 }}>
                <span className="fp-muted" style={{ display: 'inline-flex' }}><Icon size={13} /></span>
                <span className="fp-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label || item.resumePath || 'Unknown field'}
                </span>
              </div>
            );
          })}
        </>
      )}

      {result.unrecognized > 0 && (
        <div className="fp-faint" style={{ fontSize: 12, marginTop: 6 }}>
          {t('toolbar.unrecognized.note', { n: result.unrecognized })}
        </div>
      )}
    </div>
  );
}
